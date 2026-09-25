import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe,
  Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { LogadoGuard, Usuario, UsuarioSessao } from '../auth/guards';
import { PermissoesService } from '../permissoes/permissoes';
import { registrarAuditoria } from '../usuarios/auditoria';

const STATUS = ['nao_iniciado', 'em_andamento', 'em_atraso', 'concluido'];
const PERIODICIDADES = ['semanal', 'mensal', 'trimestral', 'semestral', 'anual', 'unica'];
const CAMPOS_FICHA = ['formula_numerador', 'linha_base', 'fonte', 'periodicidade', 'responsavel'];

const ficha = (i: any) => CAMPOS_FICHA.filter((c) => i[c] !== null && i[c] !== '').length;

function texto(v: unknown, max = 2000): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s.length > max) throw new BadRequestException(`Texto maior que ${max} caracteres`);
  return s || null;
}
function numero(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BadRequestException('Valor numérico inválido');
  return n;
}
function status(v: unknown, padrao = 'nao_iniciado') {
  const s = (v as string) ?? padrao;
  if (!STATUS.includes(s)) throw new BadRequestException('Status inválido');
  return s;
}

@Controller()
@UseGuards(LogadoGuard)
export class MetasController {
  constructor(private db: DbService, private perms: PermissoesService) {}

  private async meta(id: number) {
    const m = await this.db.um('SELECT * FROM hub.metas WHERE id = $1', [id]);
    if (!m) throw new NotFoundException('Meta não encontrada');
    return m;
  }

  // ------------------------------------------------------------------ metas
  @Get('metas')
  async listar(@Usuario() u: UsuarioSessao, @Query('grupo') grupo?: string, @Query('eixo') eixo?: string) {
    const escopo = await this.perms.escopo(u, 'metas.ver');
    if (escopo === 'nenhum' || escopo === 'proprio') throw new ForbiddenException('Sem permissão para ver metas');
    const filtros: string[] = [];
    const params: unknown[] = [];
    if (escopo === 'grupo') { params.push(u.grupo ?? -1); filtros.push(`m.grupo = $${params.length}`); }
    if (grupo) { params.push(Number(grupo)); filtros.push(`m.grupo = $${params.length}`); }
    if (eixo) { params.push(eixo); filtros.push(`m.eixo = $${params.length}`); }
    const metas = await this.db.query(
      `SELECT m.*,
         (SELECT count(*) FROM hub.acoes a WHERE a.meta_id = m.id)::int AS n_acoes,
         (SELECT count(*) FROM hub.acoes a WHERE a.meta_id = m.id AND a.status = 'concluido')::int AS n_acoes_concluidas
       FROM hub.metas m ${filtros.length ? 'WHERE ' + filtros.join(' AND ') : ''} ORDER BY m.ordem`, params);
    const inds = metas.length
      ? await this.db.query('SELECT * FROM hub.indicadores WHERE meta_id = ANY($1::int[])', [metas.map((m) => m.id)])
      : [];
    for (const m of metas) {
      const meus = inds.filter((i) => i.meta_id === m.id);
      m.n_indicadores = meus.length;
      m.fichas_completas = meus.filter((i) => ficha(i) === CAMPOS_FICHA.length).length;
    }
    return { escopo, metas };
  }

  @Get('metas/:id')
  async obter(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number) {
    const m = await this.meta(id);
    await this.perms.exigir(u, 'metas.ver', m.grupo);
    const indicadores = await this.db.query('SELECT * FROM hub.indicadores WHERE meta_id = $1 ORDER BY oficial DESC, id', [id]);
    for (const i of indicadores) { i.ficha_preenchida = ficha(i); i.ficha_total = CAMPOS_FICHA.length; }
    const podeVerAcoes = await this.perms.pode(u, 'acoes.ver', m.grupo);
    const acoes = podeVerAcoes ? await this.db.query(
      `SELECT a.*, r.nome AS responsavel_nome FROM hub.acoes a
       LEFT JOIN hub.usuarios r ON r.id = a.responsavel_id WHERE a.meta_id = $1 ORDER BY a.criado_em`, [id]) : [];
    const escopoAcoes = await this.perms.escopo(u, 'acoes.editar');
    return {
      ...m, indicadores, acoes,
      pode: {
        editar_meta: await this.perms.pode(u, 'metas.editar', m.grupo),
        editar_indicadores: await this.perms.pode(u, 'indicadores.editar', m.grupo),
        ver_acoes: podeVerAcoes,
        criar_acoes: await this.perms.pode(u, 'acoes.editar', m.grupo) || escopoAcoes === 'proprio',
        editar_acoes_escopo: escopoAcoes,
      },
    };
  }

  @Put('metas/:id')
  async atualizarMeta(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number, @Body() d: any) {
    const m = await this.meta(id);
    await this.perms.exigir(u, 'metas.editar', m.grupo);
    const r = await this.db.um(
      `UPDATE hub.metas SET status = $2, responsaveis = $3, parceiros = $4,
         prazo_inicio = $5, prazo_fim = $6, atualizado_em = now() WHERE id = $1 RETURNING *`,
      [id, status(d.status, m.status), texto(d.responsaveis) ?? m.responsaveis, texto(d.parceiros) ?? m.parceiros,
        numero(d.prazo_inicio) ?? m.prazo_inicio, numero(d.prazo_fim) ?? m.prazo_fim]);
    await registrarAuditoria(this.db, u, `alterou a meta ${m.codigo}`, null, { status: [m.status, r.status] });
    return r;
  }

  // ------------------------------------------------------------------ indicadores
  private dadosIndicador(d: any) {
    if (d.periodicidade && !PERIODICIDADES.includes(d.periodicidade)) throw new BadRequestException('Periodicidade inválida');
    return [texto(d.formula_numerador), texto(d.formula_denominador), texto(d.unidade, 50), numero(d.linha_base),
      numero(d.valor_alvo), texto(d.fonte), d.periodicidade || null, texto(d.responsavel, 200), texto(d.observacoes)];
  }

  @Post('metas/:id/indicadores')
  async criarIndicador(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number, @Body() d: any) {
    const m = await this.meta(id);
    await this.perms.exigir(u, 'indicadores.editar', m.grupo);
    if (!texto(d.nome, 300)) throw new BadRequestException('Informe o nome do indicador');
    const r = await this.db.um(
      `INSERT INTO hub.indicadores (meta_id, nome, formula_numerador, formula_denominador, unidade, linha_base,
         valor_alvo, fonte, periodicidade, responsavel, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [id, texto(d.nome, 300), ...this.dadosIndicador(d)]);
    await registrarAuditoria(this.db, u, `criou indicador na meta ${m.codigo}`, null, { indicador: r.nome });
    return r;
  }

  @Put('indicadores/:id')
  async atualizarIndicador(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number, @Body() d: any) {
    const i = await this.db.um('SELECT i.*, m.grupo, m.codigo FROM hub.indicadores i JOIN hub.metas m ON m.id = i.meta_id WHERE i.id = $1', [id]);
    if (!i) throw new NotFoundException('Indicador não encontrado');
    await this.perms.exigir(u, 'indicadores.editar', i.grupo);
    // o nome do indicador oficial vem do edital e não muda
    const nome = i.oficial ? i.nome : (texto(d.nome, 300) ?? i.nome);
    const r = await this.db.um(
      `UPDATE hub.indicadores SET nome = $2, formula_numerador = $3, formula_denominador = $4, unidade = $5,
         linha_base = $6, valor_alvo = $7, fonte = $8, periodicidade = $9, responsavel = $10, observacoes = $11,
         atualizado_em = now() WHERE id = $1 RETURNING *`,
      [id, nome, ...this.dadosIndicador(d)]);
    await registrarAuditoria(this.db, u, `editou a ficha do indicador da meta ${i.codigo}`, null, { indicador: r.nome, preenchida: `${ficha(r)}/${CAMPOS_FICHA.length}` });
    return r;
  }

  @Delete('indicadores/:id')
  async apagarIndicador(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number) {
    const i = await this.db.um('SELECT i.*, m.grupo, m.codigo FROM hub.indicadores i JOIN hub.metas m ON m.id = i.meta_id WHERE i.id = $1', [id]);
    if (!i) throw new NotFoundException('Indicador não encontrado');
    if (i.oficial) throw new BadRequestException('O indicador oficial da meta não pode ser removido');
    await this.perms.exigir(u, 'indicadores.editar', i.grupo);
    await this.db.query('DELETE FROM hub.indicadores WHERE id = $1', [id]);
    await registrarAuditoria(this.db, u, `removeu indicador da meta ${i.codigo}`, null, { indicador: i.nome });
    return { ok: true };
  }

  // ------------------------------------------------------------------ ações
  /** Com escopo "proprio", a pessoa só mexe nas ações que criou ou pelas quais é responsável. */
  private async exigirEdicaoAcao(u: UsuarioSessao, grupo: number, acao?: any) {
    const e = await this.perms.escopo(u, 'acoes.editar');
    if (e === 'proprio') {
      if (!acao) return; // pode criar: ficará como dono
      if (acao.criado_por === u.id || acao.responsavel_id === u.id) return;
    }
    await this.perms.exigir(u, 'acoes.editar', grupo);
  }

  private async validarResponsavel(id: unknown, grupo: number) {
    if (!id) return null;
    const r = await this.db.um('SELECT id, grupo FROM hub.usuarios WHERE id = $1 AND ativo', [id]);
    if (!r) throw new BadRequestException('Responsável não encontrado');
    return r.id as string;
  }

  @Get('metas/:id/responsaveis')
  async responsaveis(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number) {
    const m = await this.meta(id);
    await this.exigirEdicaoAcao(u, m.grupo);
    return this.db.query(
      `SELECT id, nome, papel FROM hub.usuarios WHERE ativo AND (grupo = $1 OR papel = 'coordenacao_geral') ORDER BY nome`,
      [m.grupo]);
  }

  @Post('metas/:id/acoes')
  async criarAcao(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number, @Body() d: any) {
    const m = await this.meta(id);
    await this.exigirEdicaoAcao(u, m.grupo);
    if (!texto(d.titulo, 300)) throw new BadRequestException('Informe o título da ação');
    const r = await this.db.um(
      `INSERT INTO hub.acoes (meta_id, titulo, descricao, territorio, responsavel_id, prazo, status, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, texto(d.titulo, 300), texto(d.descricao), texto(d.territorio, 200),
        await this.validarResponsavel(d.responsavel_id, m.grupo), d.prazo || null, status(d.status), u.id]);
    await registrarAuditoria(this.db, u, `criou ação na meta ${m.codigo}`, null, { acao: r.titulo });
    return r;
  }

  @Put('acoes/:id')
  async atualizarAcao(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number, @Body() d: any) {
    const a = await this.db.um('SELECT a.*, m.grupo, m.codigo FROM hub.acoes a JOIN hub.metas m ON m.id = a.meta_id WHERE a.id = $1', [id]);
    if (!a) throw new NotFoundException('Ação não encontrada');
    await this.exigirEdicaoAcao(u, a.grupo, a);
    const r = await this.db.um(
      `UPDATE hub.acoes SET titulo = $2, descricao = $3, territorio = $4, responsavel_id = $5, prazo = $6, status = $7,
         atualizado_em = now() WHERE id = $1 RETURNING *`,
      [id, texto(d.titulo, 300) ?? a.titulo, texto(d.descricao), texto(d.territorio, 200),
        await this.validarResponsavel(d.responsavel_id, a.grupo), d.prazo || null, status(d.status, a.status)]);
    await registrarAuditoria(this.db, u, `alterou ação da meta ${a.codigo}`, null, { acao: r.titulo, status: [a.status, r.status] });
    return r;
  }

  @Delete('acoes/:id')
  async apagarAcao(@Usuario() u: UsuarioSessao, @Param('id', ParseIntPipe) id: number) {
    const a = await this.db.um('SELECT a.*, m.grupo, m.codigo FROM hub.acoes a JOIN hub.metas m ON m.id = a.meta_id WHERE a.id = $1', [id]);
    if (!a) throw new NotFoundException('Ação não encontrada');
    await this.exigirEdicaoAcao(u, a.grupo, a);
    await this.db.query('DELETE FROM hub.acoes WHERE id = $1', [id]);
    await registrarAuditoria(this.db, u, `removeu ação da meta ${a.codigo}`, null, { acao: a.titulo });
    return { ok: true };
  }
}
