import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe,
  Post, Put, Query, Res, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { join } from 'path';
import { DbService } from '../db/db.service';
import { LogadoGuard, Usuario, UsuarioSessao } from '../auth/guards';
import { PermissoesService } from '../permissoes/permissoes';
import { Funcionalidade, FuncionalidadeGuard } from '../funcionalidades/funcionalidades';
import { registrarAuditoria } from '../usuarios/auditoria';
import { CatalogosService } from '../catalogos/catalogos';
import {
  MAX_ARQUIVOS, PASTA_EVIDENCIAS, apagarArquivos, lerLinks, opcoesUpload, sha256,
} from './armazenamento';

const STATUS = ['nao_iniciado', 'em_andamento', 'em_atraso', 'concluido'];
const META_SEMANAL_MIN = 8 * 60;

interface AtividadeIn {
  data?: string; hora_inicio?: string; hora_fim?: string; tipo?: string; modalidade?: string;
  territorio?: string; territorio_codigo?: string | null; acao_id?: string | number | null; descricao?: string; status?: string; links?: unknown;
}

function validar(d: AtividadeIn) {
  const erro = (m: string) => { throw new BadRequestException(m); };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data ?? '')) erro('Data inválida');
  if (d.data! > new Date().toLocaleDateString('sv-SE')) erro('A data não pode estar no futuro');
  if (!/^\d{2}:\d{2}$/.test(d.hora_inicio ?? '') || !/^\d{2}:\d{2}$/.test(d.hora_fim ?? '')) erro('Horário inválido');
  if (d.hora_fim! <= d.hora_inicio!) erro('O horário final precisa ser depois do inicial');
  if (!d.descricao?.trim()) erro('Descreva a atividade');
  if (d.descricao!.length > 4000) erro('Descrição muito longa');
  if (d.status && !STATUS.includes(d.status)) erro('Status inválido');
}

/** Segunda-feira da semana de uma data (YYYY-MM-DD). */
function inicioDaSemana(data: string) {
  const d = new Date(data + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const SELECT_ATIVIDADE = `
  SELECT a.*, to_char(a.data, 'YYYY-MM-DD') AS data, to_char(a.hora_inicio, 'HH24:MI') AS hora_inicio,
         to_char(a.hora_fim, 'HH24:MI') AS hora_fim,
         ac.titulo AS acao_titulo, m.codigo AS meta_codigo, v.nome AS validador_nome, t.nome AS territorio_nome,
         COALESCE((SELECT json_agg(json_build_object('id', e.id, 'tipo', e.tipo, 'nome', e.nome, 'url', e.url,
                   'mime', e.mime, 'tamanho', e.tamanho) ORDER BY e.enviado_em)
                   FROM hub.evidencias e WHERE e.atividade_id = a.id), '[]') AS evidencias
  FROM hub.atividades a
  LEFT JOIN hub.acoes ac ON ac.id = a.acao_id
  LEFT JOIN hub.metas m ON m.id = ac.meta_id
  LEFT JOIN hub.usuarios v ON v.id = a.validador_id
  LEFT JOIN hub.catalogo_itens t ON t.catalogo = 'territorios' AND t.codigo = a.territorio_codigo`;

@Controller()
@UseGuards(LogadoGuard, FuncionalidadeGuard)
@Funcionalidade('atividades')
export class AtividadesController {
  constructor(private db: DbService, private perms: PermissoesService, private cat: CatalogosService) {}

  /** Tipo, modalidade e território precisam existir (e estar ativos) nos cadastros. */
  private async validarCadastros(d: AtividadeIn) {
    await this.cat.exigir('tipos_atividade', d.tipo, 'o tipo de atividade');
    await this.cat.exigir('modalidades', d.modalidade, 'a modalidade');
    d.territorio_codigo = await this.cat.exigir('territorios', d.territorio_codigo, 'o território', true);
  }

  private async exigirRegistro(u: UsuarioSessao) {
    if ((await this.perms.escopo(u, 'atividades.registrar')) === 'nenhum')
      throw new ForbiddenException('Seu papel não registra atividades');
  }

  /** Atividade da própria pessoa, ainda editável (não validada). */
  private async minhaEditavel(u: UsuarioSessao, id: string) {
    const a = await this.db.um('SELECT * FROM hub.atividades WHERE id = $1', [id]);
    if (!a) throw new NotFoundException('Atividade não encontrada');
    if (a.usuario_id !== u.id) throw new ForbiddenException('Só quem registrou pode alterar a atividade');
    if (a.validacao === 'validada') throw new BadRequestException('Atividade já validada não pode ser alterada');
    return a;
  }

  private async acaoValida(u: UsuarioSessao, acaoId: unknown) {
    if (acaoId === undefined || acaoId === null || acaoId === '') return null;
    const a = await this.db.um('SELECT a.id, m.grupo FROM hub.acoes a JOIN hub.metas m ON m.id = a.meta_id WHERE a.id = $1', [Number(acaoId)]);
    if (!a) throw new BadRequestException('Ação relacionada não encontrada');
    if (!(await this.perms.pode(u, 'acoes.ver', a.grupo))) throw new BadRequestException('Você não tem acesso a essa ação');
    return a.id as number;
  }

  private async gravarEvidencias(c: any, atividadeId: string, arquivos: Express.Multer.File[], links: { nome: string; url: string }[]) {
    for (const f of arquivos) {
      await c.query(
        `INSERT INTO hub.evidencias (atividade_id, tipo, nome, arquivo, mime, tamanho, sha256)
         VALUES ($1, 'arquivo', $2, $3, $4, $5, $6)`,
        [atividadeId, f.originalname.slice(0, 200), f.filename, f.mimetype, f.size, sha256(f.filename)]);
    }
    for (const l of links) {
      await c.query(`INSERT INTO hub.evidencias (atividade_id, tipo, nome, url) VALUES ($1, 'link', $2, $3)`,
        [atividadeId, l.nome, l.url]);
    }
  }

  // ------------------------------------------------------------------ registro (tela 16)
  @Get('atividades/minhas')
  async minhas(@Usuario() u: UsuarioSessao, @Query('de') de?: string, @Query('ate') ate?: string) {
    await this.exigirRegistro(u);
    const hoje = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
    const inicio = de && /^\d{4}-\d{2}-\d{2}$/.test(de) ? de : inicioDaSemana(hoje);
    const fim = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : hoje;
    const atividades = await this.db.query(
      `${SELECT_ATIVIDADE} WHERE a.usuario_id = $1 AND a.data BETWEEN $2 AND $3 ORDER BY a.data DESC, a.hora_inicio DESC`,
      [u.id, inicio, fim]);
    const semana = await this.db.um(
      `SELECT COALESCE(sum(minutos), 0)::int AS minutos FROM hub.atividades WHERE usuario_id = $1 AND data >= $2`,
      [u.id, inicioDaSemana(hoje)]);
    const devolvidas = await this.db.query(
      `${SELECT_ATIVIDADE} WHERE a.usuario_id = $1 AND a.validacao = 'devolvida' ORDER BY a.data`, [u.id]);
    return { de: inicio, ate: fim, atividades, devolvidas, semana: { minutos: semana.minutos, meta: META_SEMANAL_MIN } };
  }

  @Get('atividades/opcoes')
  async opcoes(@Usuario() u: UsuarioSessao) {
    const escopo = await this.perms.escopo(u, 'acoes.ver');
    const acoes = escopo === 'nenhum' || escopo === 'proprio' ? [] : await this.db.query(
      `SELECT a.id, a.titulo, m.codigo AS meta_codigo, m.grupo FROM hub.acoes a JOIN hub.metas m ON m.id = a.meta_id
       ${escopo === 'grupo' ? 'WHERE m.grupo = $1' : ''} ORDER BY m.ordem, a.titulo`,
      escopo === 'grupo' ? [u.grupo ?? -1] : []);
    return { acoes }; // tipos, modalidades e territórios vêm de /catalogos
  }

  @Post('atividades')
  @UseInterceptors(FilesInterceptor('arquivos', MAX_ARQUIVOS, opcoesUpload))
  async registrar(@Usuario() u: UsuarioSessao, @Body() d: AtividadeIn, @UploadedFiles() arquivos: Express.Multer.File[] = []) {
    try {
      await this.exigirRegistro(u);
      validar(d);
      await this.validarCadastros(d);
      const links = lerLinks(d.links);
      if (!arquivos.length && !links.length)
        throw new BadRequestException('Evidência é obrigatória: anexe um arquivo ou informe um link');
      const acaoId = await this.acaoValida(u, d.acao_id);
      const id = await this.db.transacao(async (c) => {
        const { rows } = await c.query(
          `INSERT INTO hub.atividades (usuario_id, grupo, data, hora_inicio, hora_fim, tipo, modalidade, territorio,
             acao_id, descricao, status, territorio_codigo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
          [u.id, u.grupo, d.data, d.hora_inicio, d.hora_fim, d.tipo, d.modalidade, d.territorio?.trim() || null,
            acaoId, d.descricao!.trim(), d.status || 'concluido', d.territorio_codigo || null]);
        await this.gravarEvidencias(c, rows[0].id, arquivos, links);
        return rows[0].id as string;
      });
      return this.db.um(`${SELECT_ATIVIDADE} WHERE a.id = $1`, [id]);
    } catch (e) {
      apagarArquivos(arquivos.map((f) => f.filename)); // não deixa arquivo órfão
      throw e;
    }
  }

  @Put('atividades/:id')
  async editar(@Usuario() u: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string, @Body() d: AtividadeIn) {
    const a = await this.minhaEditavel(u, id);
    validar(d);
    await this.validarCadastros(d);
    const acaoId = await this.acaoValida(u, d.acao_id);
    await this.db.query(
      `UPDATE hub.atividades SET data = $2, hora_inicio = $3, hora_fim = $4, tipo = $5, modalidade = $6, territorio = $7,
         acao_id = $8, descricao = $9, status = $10, territorio_codigo = $11, atualizado_em = now(),
         -- corrigida depois de devolvida: volta para a fila de validação
         validacao = CASE WHEN validacao = 'devolvida' THEN 'pendente' ELSE validacao END
       WHERE id = $1`,
      [id, d.data, d.hora_inicio, d.hora_fim, d.tipo, d.modalidade, d.territorio?.trim() || null, acaoId,
        d.descricao!.trim(), d.status || a.status, d.territorio_codigo || null]);
    return this.db.um(`${SELECT_ATIVIDADE} WHERE a.id = $1`, [id]);
  }

  @Delete('atividades/:id')
  async apagar(@Usuario() u: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string) {
    await this.minhaEditavel(u, id);
    const arquivos = await this.db.query('SELECT arquivo FROM hub.evidencias WHERE atividade_id = $1', [id]);
    await this.db.query('DELETE FROM hub.atividades WHERE id = $1', [id]);
    apagarArquivos(arquivos.map((x) => x.arquivo));
    return { ok: true };
  }

  @Post('atividades/:id/evidencias')
  @UseInterceptors(FilesInterceptor('arquivos', MAX_ARQUIVOS, opcoesUpload))
  async anexar(@Usuario() u: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string, @Body() d: AtividadeIn,
    @UploadedFiles() arquivos: Express.Multer.File[] = []) {
    try {
      await this.minhaEditavel(u, id);
      const links = lerLinks(d.links);
      if (!arquivos.length && !links.length) throw new BadRequestException('Nada para anexar');
      await this.db.transacao((c) => this.gravarEvidencias(c, id, arquivos, links));
      return this.db.um(`${SELECT_ATIVIDADE} WHERE a.id = $1`, [id]);
    } catch (e) {
      apagarArquivos(arquivos.map((f) => f.filename));
      throw e;
    }
  }

  @Delete('evidencias/:id')
  async removerEvidencia(@Usuario() u: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string) {
    const e = await this.db.um('SELECT * FROM hub.evidencias WHERE id = $1', [id]);
    if (!e) throw new NotFoundException('Evidência não encontrada');
    await this.minhaEditavel(u, e.atividade_id);
    const n = await this.db.um('SELECT count(*)::int AS n FROM hub.evidencias WHERE atividade_id = $1', [e.atividade_id]);
    if (n.n <= 1) throw new BadRequestException('A atividade precisa de pelo menos uma evidência');
    await this.db.query('DELETE FROM hub.evidencias WHERE id = $1', [id]);
    apagarArquivos([e.arquivo]);
    return { ok: true };
  }

  /** Download: quem registrou, quem pode validar ou quem pode auditar aquela pessoa. */
  @Get('evidencias/:id/arquivo')
  async baixar(@Usuario() u: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const e = await this.db.um(
      `SELECT e.*, a.usuario_id, a.grupo FROM hub.evidencias e JOIN hub.atividades a ON a.id = e.atividade_id WHERE e.id = $1`, [id]);
    if (!e || e.tipo !== 'arquivo') throw new NotFoundException('Arquivo não encontrado');
    const pode = e.usuario_id === u.id
      || await this.perms.pode(u, 'atividades.validar', e.grupo)
      || await this.perms.pode(u, 'atividades.auditar', e.grupo);
    if (!pode) throw new ForbiddenException('Sem acesso a esta evidência');
    res.setHeader('Content-Type', e.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(e.nome)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(PASTA_EVIDENCIAS, e.arquivo));
  }

  // ------------------------------------------------------------------ validação em lote (tela 17)
  @Get('validacao/fila')
  async fila(@Usuario() u: UsuarioSessao) {
    const escopo = await this.perms.escopo(u, 'atividades.validar');
    if (escopo !== 'grupo' && escopo !== 'todos') throw new ForbiddenException('Seu papel não valida atividades');
    const linhas = await this.db.query(
      `${SELECT_ATIVIDADE}
       WHERE a.validacao = 'pendente' AND a.usuario_id <> $1
         ${escopo === 'grupo' ? 'AND a.grupo = $2' : ''}
       ORDER BY a.data, a.hora_inicio`,
      escopo === 'grupo' ? [u.id, u.grupo ?? -1] : [u.id]);
    const pessoas = await this.db.query('SELECT id, nome, papel, grupo, foto_versao, foto IS NOT NULL AS tem_foto FROM hub.usuarios WHERE id = ANY($1::uuid[])',
      [[...new Set(linhas.map((l) => l.usuario_id))]]);

    // agrupa por pessoa + semana: o validador confere a semana inteira de uma vez
    const cartoes = new Map<string, any>();
    for (const a of linhas) {
      const semana = inicioDaSemana(a.data);
      const chave = `${a.usuario_id}|${semana}`;
      if (!cartoes.has(chave)) {
        cartoes.set(chave, { pessoa: pessoas.find((p) => p.id === a.usuario_id), semana, minutos: 0, atividades: [], sem_evidencia: 0 });
      }
      const c = cartoes.get(chave);
      c.atividades.push(a);
      c.minutos += a.minutos;
      if (!a.evidencias.length) c.sem_evidencia++;
    }
    return [...cartoes.values()].sort((x, y) => x.semana.localeCompare(y.semana) || x.pessoa.nome.localeCompare(y.pessoa.nome));
  }

  @Post('validacao')
  async validarLote(@Usuario() u: UsuarioSessao, @Body() d: { ids?: string[]; acao?: string; motivo?: string }) {
    if (!Array.isArray(d.ids) || !d.ids.length) throw new BadRequestException('Selecione as atividades');
    if (d.acao !== 'validar' && d.acao !== 'devolver') throw new BadRequestException('Ação inválida');
    if (d.acao === 'devolver' && !d.motivo?.trim()) throw new BadRequestException('Informe o motivo da devolução');

    const atividades = await this.db.query(
      `SELECT a.id, a.usuario_id, a.grupo, a.validacao,
         (SELECT count(*) FROM hub.evidencias e WHERE e.atividade_id = a.id)::int AS n_evidencias
       FROM hub.atividades a WHERE a.id = ANY($1::uuid[])`, [d.ids]);
    if (atividades.length !== d.ids.length) throw new BadRequestException('Alguma atividade não foi encontrada');
    for (const a of atividades) {
      if (a.usuario_id === u.id) throw new ForbiddenException('Ninguém valida as próprias atividades');
      if (a.validacao !== 'pendente') throw new BadRequestException('Só atividades pendentes podem ser validadas ou devolvidas');
      await this.perms.exigir(u, 'atividades.validar', a.grupo);
      if (d.acao === 'validar' && !a.n_evidencias) throw new BadRequestException('Atividade sem evidência não pode ser validada');
    }
    await this.db.query(
      `UPDATE hub.atividades SET validacao = $2, validador_id = $3, validado_em = now(), motivo_devolucao = $4,
         atualizado_em = now() WHERE id = ANY($1::uuid[])`,
      [d.ids, d.acao === 'validar' ? 'validada' : 'devolvida', u.id, d.acao === 'devolver' ? d.motivo!.trim() : null]);
    const pessoas = [...new Set(atividades.map((a) => a.usuario_id))];
    await registrarAuditoria(this.db, u, `${d.acao === 'validar' ? 'validou' : 'devolveu'} ${d.ids.length} atividade(s)`, null,
      { pessoas: pessoas.length, motivo: d.motivo ?? null });
    return { ok: true, total: d.ids.length };
  }

  // ------------------------------------------------------------------ resumo por pessoa (tela 18)
  @Get('resumo/pessoas')
  async pessoasVisiveis(@Usuario() u: UsuarioSessao) {
    const escopo = await this.perms.escopo(u, 'pessoas.ver');
    if (escopo === 'todos') return this.db.query(`SELECT id, nome, papel, grupo, foto_versao, foto IS NOT NULL AS tem_foto FROM hub.usuarios WHERE ativo ORDER BY nome`);
    if (escopo === 'grupo')
      return this.db.query(`SELECT id, nome, papel, grupo, foto_versao, foto IS NOT NULL AS tem_foto FROM hub.usuarios WHERE ativo AND grupo = $1 ORDER BY nome`, [u.grupo ?? -1]);
    return this.db.query('SELECT id, nome, papel, grupo, foto_versao, foto IS NOT NULL AS tem_foto FROM hub.usuarios WHERE id = $1', [u.id]);
  }

  @Get('resumo/:id')
  async resumo(@Usuario() u: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string, @Query('mes') mes?: string) {
    const p = await this.db.um('SELECT id, nome, papel, grupo, foto_versao, foto IS NOT NULL AS tem_foto FROM hub.usuarios WHERE id = $1', [id]);
    if (!p) throw new NotFoundException('Pessoa não encontrada');
    if (!(await this.perms.pode(u, 'pessoas.ver', p.grupo, p.id))) throw new ForbiddenException('Sem acesso a esta pessoa');
    const m = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toLocaleDateString('sv-SE').slice(0, 7);
    const inicio = `${m}-01`;
    const [dias, tipos, validacao, pendencias] = await Promise.all([
      this.db.query(
        `SELECT to_char(data, 'YYYY-MM-DD') AS data, sum(minutos)::int AS minutos, count(*)::int AS n
         FROM hub.atividades WHERE usuario_id = $1 AND data >= $2::date AND data < ($2::date + interval '1 month')
         GROUP BY data ORDER BY data`, [id, inicio]),
      this.db.query(
        `SELECT tipo, sum(minutos)::int AS minutos FROM hub.atividades
         WHERE usuario_id = $1 AND data >= $2::date AND data < ($2::date + interval '1 month') GROUP BY tipo`, [id, inicio]),
      this.db.query(
        `SELECT validacao, count(*)::int AS n, sum(minutos)::int AS minutos FROM hub.atividades
         WHERE usuario_id = $1 AND data >= $2::date AND data < ($2::date + interval '1 month') GROUP BY validacao`, [id, inicio]),
      this.db.query(
        `${SELECT_ATIVIDADE} WHERE a.usuario_id = $1 AND a.validacao <> 'validada' ORDER BY a.data`, [id]),
    ]);
    // horas por semana (segunda a domingo) que tocam o mês
    const semanas = new Map<string, number>();
    for (const d of dias) semanas.set(inicioDaSemana(d.data), (semanas.get(inicioDaSemana(d.data)) ?? 0) + d.minutos);
    return {
      pessoa: p, mes: m, meta_semanal: META_SEMANAL_MIN, dias, tipos, validacao,
      semanas: [...semanas.entries()].map(([inicio, minutos]) => ({ inicio, minutos })),
      pendencias,
    };
  }
}
