import {
  BadRequestException, Controller, ForbiddenException, Get, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { DbService } from '../db/db.service';
import { LogadoGuard, Usuario, UsuarioSessao } from '../auth/guards';
import { PermissoesService } from '../permissoes/permissoes';
import { Funcionalidade, FuncionalidadeGuard } from '../funcionalidades/funcionalidades';
import { CatalogosService } from '../catalogos/catalogos';
import { registrarAuditoria } from '../usuarios/auditoria';
import { Coluna, Formato, MAX_BYTES, gerarModelo, lerTabela } from '../importacao/planilha';
import { CAMPOS_OBRIGATORIOS_GUIA, COLUNAS_FICHA, fichaPreenchida, lerFicha } from './ficha-indicador';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Colunas da importação. Os apelidos são os nomes da aba "Indicadores" da planilha da coordenação:
 * a própria aba pode ser importada sem adaptação.
 */
const COLUNAS: Coluna[] = [
  { nome: 'meta', obrigatoria: true, descricao: 'Código da meta (ex.: G4-03) ou o texto da meta', apelidos: ['meta relacionada', 'meta_codigo'] },
  { nome: 'grupo', descricao: 'Grupo (ex.: PET IV). Ajuda a achar a meta pelo texto', apelidos: [] },
  { nome: 'nome', obrigatoria: true, descricao: 'Nome do indicador', apelidos: ['nome do indicador'] },
  { nome: 'o_que_mede', descricao: 'O que mede, em uma frase', apelidos: ['o que mede (uma frase)'] },
  { nome: 'formula_numerador', descricao: 'Numerador e definição de caso', apelidos: ['numerador', 'numerador + definição de caso'] },
  { nome: 'formula_denominador', descricao: 'Denominador (vazio se for contagem)', apelidos: ['denominador'] },
  { nome: 'unidade', descricao: 'Unidade (%, casos / 100 mil hab., mutirões...)' },
  { nome: 'fonte', descricao: 'Fonte do numerador (SINAN, e-SUS, registro no HUB...)', apelidos: ['fonte do numerador'] },
  { nome: 'fonte_denominador', descricao: 'Fonte do denominador', apelidos: ['fonte do denominador'] },
  { nome: 'periodicidade', descricao: 'Única, Mensal, Trimestral, Contínua... (cadastro Periodicidades)' },
  { nome: 'desagregacao', descricao: 'Município, Por região, Por UBS... (cadastro Desagregações)', apelidos: ['desagregação'] },
  { nome: 'linha_base', descricao: 'Linha de base: valor', apelidos: ['linha de base - valor', 'linha de base valor'] },
  { nome: 'linha_base_data', descricao: 'Linha de base: data ou ano', apelidos: ['linha de base - data'] },
  { nome: 'linha_base_fonte', descricao: 'Linha de base: fonte', apelidos: ['linha de base - fonte'] },
  { nome: 'valor_alvo', descricao: 'Meta: valor a atingir (ex.: <= 11,3)', apelidos: ['meta - valor', 'meta valor'] },
  { nome: 'prazo_alvo', descricao: 'Meta: prazo (ex.: mês 24)', apelidos: ['meta - prazo', 'meta prazo'] },
  { nome: 'tipo', descricao: 'Processo, Resultado ou Impacto', apelidos: ['tipo (processo/resultado/impacto)'] },
  { nome: 'responsavel', descricao: 'Responsável pela coleta', apelidos: ['responsável pela coleta'] },
  { nome: 'responsavel_validacao', descricao: 'Responsável pela validação', apelidos: ['responsável pela validação'] },
  { nome: 'id', descricao: 'Identificador da sua planilha (ignorado)', apelidos: [] },
  { nome: 'observacoes', descricao: 'Observações', apelidos: ['observações'] },
];

@Controller('indicadores')
@UseGuards(LogadoGuard, FuncionalidadeGuard)
@Funcionalidade('metas')
export class IndicadoresController {
  constructor(private db: DbService, private perms: PermissoesService, private cat: CatalogosService) {}

  /** Todos os indicadores que a pessoa pode ver, com a situação da ficha. */
  @Get()
  async listar(@Usuario() u: UsuarioSessao) {
    const escopo = await this.perms.escopo(u, 'metas.ver');
    if (escopo !== 'grupo' && escopo !== 'todos') throw new ForbiddenException('Sem permissão para ver indicadores');
    const linhas = await this.db.query(
      `SELECT i.*, m.id AS meta_id, m.codigo AS meta_codigo, m.titulo AS meta_titulo, m.grupo, m.eixo
       FROM hub.indicadores i JOIN hub.metas m ON m.id = i.meta_id
       ${escopo === 'grupo' ? 'WHERE m.grupo = $1' : ''} ORDER BY m.ordem, i.oficial DESC, i.id`,
      escopo === 'grupo' ? [u.grupo ?? -1] : []);
    const podeEditarTodos = (await this.perms.escopo(u, 'indicadores.editar')) === 'todos';
    return {
      obrigatorios: CAMPOS_OBRIGATORIOS_GUIA,
      pode_importar: podeEditarTodos || (await this.perms.escopo(u, 'indicadores.editar')) === 'grupo',
      indicadores: linhas.map((i) => ({ ...i, ficha_preenchida: fichaPreenchida(i), ficha_total: CAMPOS_OBRIGATORIOS_GUIA.length })),
    };
  }

  @Get('modelo')
  async modelo(@Query('formato') formato: string, @Res() res: Response) {
    const f = (['csv', 'txt', 'xlsx'].includes(formato) ? formato : 'xlsx') as Formato;
    const colunas = COLUNAS.filter((c) => c.nome !== 'id');
    const exemplo = ['G4-03', 'PET IV', 'Taxa de incidência de leptospirose', 'Casos novos de leptospirose em relação à população',
      'Nº de casos confirmados de leptospirose (SINAN)', 'População da área x 100.000', 'casos / 100 mil hab.', 'SINAN',
      'IBGE (estimativa populacional)', 'Trimestral', 'Por região', '12,3', '2025', 'SINAN', '<= 11,3', 'mês 24', 'Impacto',
      'Vigilância Epidemiológica', 'Coordenação PET', 'Exemplo: apague esta linha'];
    const { conteudo, tipo } = await gerarModelo(colunas, [exemplo], f, 'Modelo de importação: fichas de indicador');
    res.setHeader('Content-Type', tipo);
    res.setHeader('Content-Disposition', `attachment; filename="modelo-indicadores.${f}"`);
    res.send(conteudo);
  }

  /**
   * Importa fichas de indicador. Casa pela meta + nome do indicador (sem diferenciar acentos):
   * se existir, atualiza a ficha; se não, cria. Indicador oficial nunca muda de nome.
   */
  @Post('importar')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 }, defParamCharset: 'utf8' } as any))
  async importar(@Usuario() u: UsuarioSessao, @Query('simular') simular: string, @UploadedFile() f?: Express.Multer.File) {
    if (!f) throw new BadRequestException('Envie o arquivo');
    const tabela = await lerTabela(f.buffer, f.originalname, COLUNAS);
    const metas = await this.db.query('SELECT id, codigo, titulo, grupo FROM hub.metas');
    const grupos = await this.db.query(`SELECT codigo, nome FROM hub.catalogo_itens WHERE catalogo = 'grupos'`);
    const cadastros = await this.db.query(
      `SELECT catalogo, codigo, nome FROM hub.catalogo_itens WHERE catalogo IN ('periodicidades', 'desagregacoes', 'tipos_indicador') AND ativo`);
    const porNome = (catalogo: string, v: string) =>
      cadastros.find((c) => c.catalogo === catalogo && (c.codigo === v || semAcento(c.nome) === semAcento(v)))?.codigo ?? null;
    const existentes = await this.db.query('SELECT id, meta_id, nome, oficial FROM hub.indicadores');

    const rel = { criar: [] as any[], atualizar: [] as any[], erros: [] as { linha: number; mensagem: string }[], puladas: 0 };
    // só letras e números: "Reduzir em ≥8%" e "Reduzir em ≥ 8 %" viram o mesmo texto
    const chave = (s: string) => semAcento(s).replace(/[^a-z0-9]+/g, '');
    for (const { numero, valores: v } of tabela.linhas) {
      try {
        // linha de título de seção ou linha só com o identificador: pula sem acusar erro
        const preenchidos = Object.entries(v).filter(([k, x]) => k !== 'id' && x.trim());
        const mesclada = new Set(preenchidos.map(([, x]) => x.trim())).size === 1 && preenchidos.length > 1; // título em célula mesclada
        if ((!v.nome?.trim() && preenchidos.length <= 1) || mesclada) { rel.puladas++; continue; }
        if (!v.nome?.trim()) throw new Error('nome do indicador vazio');
        // meta pelo código (G4-03) ou pelo texto (com o grupo ajudando a desempatar)
        const grupo = v.grupo ? grupos.find((g) => semAcento(g.nome) === semAcento(v.grupo) || g.codigo === v.grupo.trim())?.codigo : null;
        const textoMeta = chave(v.meta ?? '');
        const candidatas = metas.filter((m) => chave(m.codigo) === textoMeta
          || chave(m.titulo) === textoMeta || (textoMeta.length > 20 && chave(m.titulo).startsWith(textoMeta.slice(0, 35))));
        const meta = candidatas.length > 1 && grupo ? candidatas.find((m) => String(m.grupo) === grupo) : candidatas[0];
        if (!meta) throw new Error(`meta "${(v.meta ?? '').slice(0, 60)}" não encontrada`);
        if (!(await this.perms.pode(u, 'indicadores.editar', meta.grupo))) throw new Error(`sem permissão para editar indicadores da meta ${meta.codigo}`);
        const ficha = await lerFicha(v, this.cat, porNome).catch((e) => { throw new Error(e.message); });
        const existente = existentes.find((e) => e.meta_id === meta.id && semAcento(e.nome) === semAcento(v.nome));
        (existente ? rel.atualizar : rel.criar).push({ linha: numero, id: existente?.id, meta_id: meta.id, meta: meta.codigo, nome: v.nome.trim(), ficha });
      } catch (e) {
        rel.erros.push({ linha: numero, mensagem: (e as Error).message });
      }
    }

    const aplicar = simular !== '1' && simular !== 'true';
    if (aplicar) {
      if (rel.erros.length) throw new BadRequestException('O arquivo tem erros. Corrija e simule de novo antes de importar.');
      await this.db.transacao(async (c) => {
        for (const i of rel.criar) {
          await c.query(
            `INSERT INTO hub.indicadores (meta_id, nome, ${COLUNAS_FICHA.join(', ')})
             VALUES ($1, $2, ${COLUNAS_FICHA.map((_, n) => `$${n + 3}`).join(', ')})`,
            [i.meta_id, i.nome, ...COLUNAS_FICHA.map((k) => i.ficha[k])]);
        }
        for (const i of rel.atualizar) {
          // só preenche o que veio no arquivo; campo vazio não apaga o que já está na ficha
          await c.query(
            `UPDATE hub.indicadores SET ${COLUNAS_FICHA.map((k, n) => `${k} = COALESCE($${n + 2}, ${k})`).join(', ')}, atualizado_em = now()
             WHERE id = $1`, [i.id, ...COLUNAS_FICHA.map((k) => i.ficha[k])]);
        }
      });
      await registrarAuditoria(this.db, u, `importou fichas de indicador (${f.originalname})`, null,
        { criados: rel.criar.length, atualizados: rel.atualizar.length });
    }
    const resumo = (i: any) => ({ linha: i.linha, meta: i.meta, nome: i.nome, preenchida: fichaPreenchida(i.ficha) });
    return { aplicado: aplicar, linhas: tabela.linhas.length, colunas_ignoradas: tabela.ignoradas, iguais: 0, puladas: rel.puladas, criar: rel.criar.map(resumo), atualizar: rel.atualizar.map(resumo), erros: rel.erros };
  }
}
