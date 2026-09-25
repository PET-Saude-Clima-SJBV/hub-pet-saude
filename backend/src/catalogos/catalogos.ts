import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, Post, Put, Query, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { DbService } from '../db/db.service';
import { AdminGuard, LogadoGuard, Usuario, UsuarioSessao } from '../auth/guards';
import { registrarAuditoria } from '../usuarios/auditoria';
import { Coluna, Formato, MAX_BYTES, gerarModelo, lerTabela } from '../importacao/planilha';

/** Onde cada cadastro é usado (para contar uso e impedir apagar item em uso). */
const USO: Record<string, [string, string][]> = {
  tipos_atividade: [['hub.atividades', 'tipo']],
  modalidades: [['hub.atividades', 'modalidade']],
  territorios: [['hub.atividades', 'territorio_codigo'], ['hub.acoes', 'territorio_codigo']],
  vinculos: [['hub.usuarios', 'vinculo']],
  instituicoes: [['hub.usuarios', 'instituicao'], ['hub.catalogo_itens', 'pai_codigo']],
  cursos: [['hub.usuarios', 'curso']],
  grupos: [['hub.usuarios', 'grupo'], ['hub.metas', 'grupo']],
  periodicidades: [['hub.indicadores', 'periodicidade']],
  desagregacoes: [['hub.indicadores', 'desagregacao']],
  tipos_indicador: [['hub.indicadores', 'tipo']],
};

const COLUNAS_IMPORTACAO: Coluna[] = [
  { nome: 'codigo', descricao: 'Identificador fixo, sem espaços (ex.: unifae-medicina). Vazio: o sistema cria a partir do nome.' },
  { nome: 'nome', obrigatoria: true, descricao: 'Nome que aparece nas telas.' },
  { nome: 'sigla', descricao: 'Sigla ou nome curto (opcional).' },
  { nome: 'descricao', descricao: 'Explicação curta (opcional).' },
  { nome: 'pai', descricao: 'Só para cursos: código da instituição (ex.: unifae).' },
  { nome: 'ordem', descricao: 'Número para ordenar a lista (opcional).' },
  { nome: 'ativo', descricao: 'sim ou não. Vazio: sim.' },
];

/** "Engenharia de Software" -> "engenharia-de-software" */
export function gerarCodigo(nome: string, prefixo = '') {
  const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (prefixo ? `${prefixo}-${base}` : base).slice(0, 60) || 'item';
}

interface Item { catalogo: string; codigo: string; nome: string; sigla: string | null; descricao: string | null; pai_codigo: string | null; ativo: boolean; ordem: number; sistema: boolean }

@Injectable()
export class CatalogosService {
  constructor(private db: DbService) {}

  async catalogo(chave: string) {
    const c = await this.db.um('SELECT * FROM hub.catalogos WHERE chave = $1', [chave]);
    if (!c) throw new NotFoundException('Cadastro não encontrado');
    return c;
  }

  /** Confere se o código existe e está ativo no cadastro. Vazio é aceito quando `opcional`. */
  async exigir(catalogo: string, codigo: unknown, rotulo: string, opcional = false): Promise<string | null> {
    if (codigo === undefined || codigo === null || codigo === '') {
      if (opcional) return null;
      throw new BadRequestException(`Informe ${rotulo}`);
    }
    const ok = await this.db.um('SELECT 1 FROM hub.catalogo_itens WHERE catalogo = $1 AND codigo = $2 AND ativo', [catalogo, String(codigo)]);
    if (!ok) {
      const nome = rotulo.replace(/^(o|a)\s+/, '');
      throw new BadRequestException(`${nome[0].toUpperCase() + nome.slice(1)}: opção inexistente ou inativa. Escolha outra.`);
    }
    return String(codigo);
  }

  async usos(catalogo: string): Promise<Map<string, number>> {
    const r = new Map<string, number>();
    for (const [tabela, coluna] of USO[catalogo] ?? []) {
      const extra = tabela === 'hub.catalogo_itens' ? `AND catalogo = 'cursos'` : '';
      const linhas = await this.db.query(`SELECT ${coluna}::text AS codigo, count(*)::int AS n FROM ${tabela} WHERE ${coluna} IS NOT NULL ${extra} GROUP BY 1`);
      for (const l of linhas) r.set(l.codigo, (r.get(l.codigo) ?? 0) + l.n);
    }
    return r;
  }
}

@Controller()
@UseGuards(LogadoGuard)
export class CatalogosController {
  constructor(private db: DbService, private cat: CatalogosService) {}

  /** Itens ativos de todos os cadastros, para os formulários. */
  @Get('catalogos')
  async ativos() {
    const itens = await this.db.query(
      `SELECT catalogo, codigo, nome, sigla, pai_codigo FROM hub.catalogo_itens WHERE ativo ORDER BY catalogo, ordem, nome`);
    const r: Record<string, unknown[]> = {};
    for (const i of itens) (r[i.catalogo] ??= []).push({ codigo: i.codigo, nome: i.nome, sigla: i.sigla, pai: i.pai_codigo });
    return r;
  }

  // ------------------------------------------------------------------ administração
  @Get('admin/catalogos')
  @UseGuards(AdminGuard)
  listar() {
    return this.db.query(
      `SELECT c.*, count(i.codigo)::int AS total, count(i.codigo) FILTER (WHERE i.ativo)::int AS ativos
       FROM hub.catalogos c LEFT JOIN hub.catalogo_itens i ON i.catalogo = c.chave GROUP BY c.chave ORDER BY c.ordem`);
  }

  @Get('admin/catalogos/:chave')
  @UseGuards(AdminGuard)
  async itens(@Param('chave') chave: string) {
    const catalogo = await this.cat.catalogo(chave);
    const usos = await this.cat.usos(chave);
    const itens = (await this.db.query('SELECT * FROM hub.catalogo_itens WHERE catalogo = $1 ORDER BY ordem, nome', [chave]))
      .map((i) => ({ ...i, uso: usos.get(i.codigo) ?? 0 }));
    const pais = catalogo.pai
      ? await this.db.query('SELECT codigo, nome, sigla FROM hub.catalogo_itens WHERE catalogo = $1 ORDER BY ordem, nome', [catalogo.pai])
      : [];
    return { catalogo, itens, pais };
  }

  private async validarItem(chave: string, d: any, catalogo: any) {
    const nome = String(d.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Informe o nome');
    if (nome.length > 200) throw new BadRequestException('Nome muito longo');
    let pai: string | null = null;
    if (catalogo.pai) {
      pai = String(d.pai_codigo ?? d.pai ?? '').trim() || null;
      if (pai && !(await this.db.um('SELECT 1 FROM hub.catalogo_itens WHERE catalogo = $1 AND codigo = $2', [catalogo.pai, pai])))
        throw new BadRequestException(`Item pai "${pai}" não existe`);
    }
    return {
      nome, pai,
      sigla: String(d.sigla ?? '').trim().slice(0, 30) || null,
      descricao: String(d.descricao ?? '').trim().slice(0, 500) || null,
      ordem: Number.isFinite(Number(d.ordem)) && d.ordem !== '' ? Number(d.ordem) : 0,
    };
  }

  @Post('admin/catalogos/:chave')
  @UseGuards(AdminGuard)
  async criar(@Usuario() u: UsuarioSessao, @Param('chave') chave: string, @Body() d: any) {
    const catalogo = await this.cat.catalogo(chave);
    const v = await this.validarItem(chave, d, catalogo);
    const codigo = String(d.codigo ?? '').trim() || gerarCodigo(v.nome, v.pai ?? '');
    if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(codigo)) throw new BadRequestException('Código: só letras minúsculas, números, - e _');
    if (await this.db.um('SELECT 1 FROM hub.catalogo_itens WHERE catalogo = $1 AND codigo = $2', [chave, codigo]))
      throw new BadRequestException(`Já existe um item com o código "${codigo}"`);
    const r = await this.db.um(
      `INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, sigla, descricao, pai_codigo, ordem)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [chave, codigo, v.nome, v.sigla, v.descricao, v.pai, v.ordem]);
    await registrarAuditoria(this.db, u, `cadastro "${catalogo.nome}": criou "${v.nome}"`, null);
    return r;
  }

  /** O código não muda (é o que está gravado nos registros); o resto sim. */
  @Put('admin/catalogos/:chave/:codigo')
  @UseGuards(AdminGuard)
  async editar(@Usuario() u: UsuarioSessao, @Param('chave') chave: string, @Param('codigo') codigo: string, @Body() d: any) {
    const catalogo = await this.cat.catalogo(chave);
    const antes = await this.db.um('SELECT * FROM hub.catalogo_itens WHERE catalogo = $1 AND codigo = $2', [chave, codigo]);
    if (!antes) throw new NotFoundException('Item não encontrado');
    const v = await this.validarItem(chave, { ...antes, ...d }, catalogo);
    const ativo = d.ativo === undefined ? antes.ativo : !!d.ativo;
    const r = await this.db.um(
      `UPDATE hub.catalogo_itens SET nome = $3, sigla = $4, descricao = $5, pai_codigo = $6, ordem = $7, ativo = $8, atualizado_em = now()
       WHERE catalogo = $1 AND codigo = $2 RETURNING *`, [chave, codigo, v.nome, v.sigla, v.descricao, v.pai, v.ordem, ativo]);
    const mudou = antes.ativo !== ativo ? (ativo ? ' (reativou)' : ' (inativou)') : '';
    await registrarAuditoria(this.db, u, `cadastro "${catalogo.nome}": alterou "${v.nome}"${mudou}`, null);
    return r;
  }

  @Delete('admin/catalogos/:chave/:codigo')
  @UseGuards(AdminGuard)
  async apagar(@Usuario() u: UsuarioSessao, @Param('chave') chave: string, @Param('codigo') codigo: string) {
    const catalogo = await this.cat.catalogo(chave);
    const item = await this.db.um('SELECT * FROM hub.catalogo_itens WHERE catalogo = $1 AND codigo = $2', [chave, codigo]);
    if (!item) throw new NotFoundException('Item não encontrado');
    if (item.sistema) throw new BadRequestException('Item padrão do sistema: pode ser renomeado ou inativado, mas não apagado');
    const uso = (await this.cat.usos(chave)).get(codigo) ?? 0;
    if (uso) throw new BadRequestException(`Item em uso em ${uso} registro(s). Inative em vez de apagar.`);
    await this.db.query('DELETE FROM hub.catalogo_itens WHERE catalogo = $1 AND codigo = $2', [chave, codigo]);
    await registrarAuditoria(this.db, u, `cadastro "${catalogo.nome}": apagou "${item.nome}"`, null);
    return { ok: true };
  }

  // ------------------------------------------------------------------ modelo e importação
  @Get('admin/catalogos/:chave/modelo')
  @UseGuards(AdminGuard)
  async modelo(@Param('chave') chave: string, @Query('formato') formato: string, @Res() res: Response) {
    const catalogo = await this.cat.catalogo(chave);
    const f = (['csv', 'txt', 'xlsx'].includes(formato) ? formato : 'xlsx') as Formato;
    const exemplos = (await this.db.query(
      'SELECT codigo, nome, sigla, descricao, pai_codigo, ordem, ativo FROM hub.catalogo_itens WHERE catalogo = $1 ORDER BY ordem, nome LIMIT 3', [chave]))
      .map((i) => [i.codigo, i.nome, i.sigla ?? '', i.descricao ?? '', i.pai_codigo ?? '', String(i.ordem), i.ativo ? 'sim' : 'não']);
    const { conteudo, tipo } = await gerarModelo(COLUNAS_IMPORTACAO, exemplos, f, `Modelo de importação: ${catalogo.nome}`);
    res.setHeader('Content-Type', tipo);
    res.setHeader('Content-Disposition', `attachment; filename="modelo-${chave}.${f}"`);
    res.send(conteudo);
  }

  /**
   * Importa itens. Com `simular=1` só confere e devolve o relatório (nada é gravado).
   * Casa pelo código; sem código, pelo nome (sem diferenciar maiúsculas e acentos).
   */
  @Post('admin/catalogos/:chave/importar')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 }, defParamCharset: 'utf8' } as any))
  async importar(@Usuario() u: UsuarioSessao, @Param('chave') chave: string, @Query('simular') simular: string,
    @UploadedFile() f?: Express.Multer.File) {
    if (!f) throw new BadRequestException('Envie o arquivo');
    const catalogo = await this.cat.catalogo(chave);
    const tabela = await lerTabela(f.buffer, f.originalname, COLUNAS_IMPORTACAO);
    const existentes: any[] = await this.db.query('SELECT * FROM hub.catalogo_itens WHERE catalogo = $1', [chave]);
    const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const pais = catalogo.pai
      ? new Set((await this.db.query('SELECT codigo FROM hub.catalogo_itens WHERE catalogo = $1', [catalogo.pai])).map((p) => p.codigo))
      : null;

    const relatorio = { criar: [] as any[], atualizar: [] as any[], iguais: 0, erros: [] as { linha: number; mensagem: string }[] };
    const vistos = new Set<string>();
    for (const { numero, valores: v } of tabela.linhas) {
      const nome = v.nome?.trim();
      if (!nome) { relatorio.erros.push({ linha: numero, mensagem: 'nome vazio' }); continue; }
      const ativoTxt = semAcento(v.ativo ?? '');
      if (ativoTxt && !['sim', 's', 'nao', 'n', '1', '0', 'true', 'false'].includes(ativoTxt)) {
        relatorio.erros.push({ linha: numero, mensagem: `ativo "${v.ativo}" deve ser sim ou não` }); continue;
      }
      const ativo = !ativoTxt || ['sim', 's', '1', 'true'].includes(ativoTxt);
      const pai = pais ? (v.pai?.trim() || null) : null;
      if (pais && pai && !pais.has(pai)) { relatorio.erros.push({ linha: numero, mensagem: `pai "${pai}" não existe` }); continue; }
      const ordem = v.ordem?.trim() ? Number(v.ordem) : undefined;
      if (ordem !== undefined && !Number.isFinite(ordem)) { relatorio.erros.push({ linha: numero, mensagem: `ordem "${v.ordem}" não é número` }); continue; }

      const existente = v.codigo?.trim()
        ? existentes.find((e) => e.codigo === v.codigo.trim())
        : existentes.find((e) => semAcento(e.nome) === semAcento(nome) && (e.pai_codigo ?? null) === pai);
      const codigo = existente?.codigo ?? (v.codigo?.trim() || gerarCodigo(nome, pai ?? ''));
      if (!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(codigo)) { relatorio.erros.push({ linha: numero, mensagem: `código "${codigo}" inválido` }); continue; }
      if (vistos.has(codigo)) { relatorio.erros.push({ linha: numero, mensagem: `código "${codigo}" repetido no arquivo` }); continue; }
      vistos.add(codigo);

      const novo = {
        codigo, nome, sigla: v.sigla?.trim() || null, descricao: v.descricao?.trim() || null, pai_codigo: pai,
        ordem: ordem ?? existente?.ordem ?? 0, ativo,
      };
      if (!existente) relatorio.criar.push({ linha: numero, ...novo });
      else if (['nome', 'sigla', 'descricao', 'pai_codigo', 'ordem', 'ativo'].some((k) => (existente[k] ?? null) !== ((novo as any)[k] ?? null)))
        relatorio.atualizar.push({ linha: numero, antes: existente.nome, ...novo });
      else relatorio.iguais++;
    }

    const aplicar = simular !== '1' && simular !== 'true';
    if (aplicar) {
      if (relatorio.erros.length) throw new BadRequestException('O arquivo tem erros. Corrija e simule de novo antes de importar.');
      await this.db.transacao(async (c) => {
        for (const i of [...relatorio.criar, ...relatorio.atualizar]) {
          await c.query(
            `INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, sigla, descricao, pai_codigo, ordem, ativo)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (catalogo, codigo) DO UPDATE SET nome = EXCLUDED.nome, sigla = EXCLUDED.sigla, descricao = EXCLUDED.descricao,
               pai_codigo = EXCLUDED.pai_codigo, ordem = EXCLUDED.ordem, ativo = EXCLUDED.ativo, atualizado_em = now()`,
            [chave, i.codigo, i.nome, i.sigla, i.descricao, i.pai_codigo, i.ordem, i.ativo]);
        }
      });
      await registrarAuditoria(this.db, u, `cadastro "${catalogo.nome}": importou ${f.originalname}`, null,
        { criados: relatorio.criar.length, atualizados: relatorio.atualizar.length, iguais: relatorio.iguais });
    }
    return { aplicado: aplicar, linhas: tabela.linhas.length, colunas_ignoradas: tabela.ignoradas, ...relatorio };
  }
}
