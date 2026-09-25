import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Put, UseGuards,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AdminGuard, LogadoGuard, Usuario, UsuarioSessao } from '../auth/guards';
import { registrarAuditoria } from '../usuarios/auditoria';

export type Escopo = 'nenhum' | 'proprio' | 'grupo' | 'todos';

export const CAPACIDADES: Record<string, string> = {
  'metas.ver': 'Ver metas e indicadores',
  'metas.editar': 'Editar metas (status, prazos, responsáveis)',
  'indicadores.editar': 'Editar fichas de indicador',
  'acoes.ver': 'Ver ações',
  'acoes.editar': 'Criar e editar ações',
  'pessoas.ver': 'Ver pessoas',
  'atividades.registrar': 'Registrar atividades',
  'atividades.validar': 'Validar atividades',
  'atividades.auditar': 'Auditar atividades',
};
export const ESCOPOS: Escopo[] = ['nenhum', 'proprio', 'grupo', 'todos'];
const PAPEIS = ['coordenacao_geral', 'coordenador', 'tutor', 'preceptor', 'aluno', 'externo'];

/**
 * O que cada pessoa pode fazer, a partir do papel dela (matriz hub.papel_permissoes).
 * O "Administrador do sistema" pode tudo, em qualquer escopo.
 */
@Injectable()
export class PermissoesService {
  private matriz: Map<string, Escopo> | null = null;

  constructor(private db: DbService) {}

  private async carregar() {
    if (!this.matriz) {
      const linhas = await this.db.query('SELECT papel, capacidade, escopo FROM hub.papel_permissoes');
      this.matriz = new Map(linhas.map((l) => [`${l.papel}|${l.capacidade}`, l.escopo]));
    }
    return this.matriz;
  }

  invalidar() {
    this.matriz = null;
  }

  async escopo(u: UsuarioSessao, capacidade: string): Promise<Escopo> {
    if (u.admin_sistema) return 'todos';
    return (await this.carregar()).get(`${u.papel}|${capacidade}`) ?? 'nenhum';
  }

  async todas(u: UsuarioSessao) {
    const r: Record<string, Escopo> = {};
    for (const c of Object.keys(CAPACIDADES)) r[c] = await this.escopo(u, c);
    return r;
  }

  /** Pode aplicar a capacidade sobre algo do grupo `grupo` (e, se informado, cujo dono é `donoId`)? */
  async pode(u: UsuarioSessao, capacidade: string, grupo: number | null, donoId?: string | null) {
    const e = await this.escopo(u, capacidade);
    if (e === 'todos') return true;
    if (e === 'grupo') return grupo != null && grupo === u.grupo;
    if (e === 'proprio') return !!donoId && donoId === u.id;
    return false;
  }

  async exigir(u: UsuarioSessao, capacidade: string, grupo: number | null, donoId?: string | null) {
    if (!(await this.pode(u, capacidade, grupo, donoId)))
      throw new ForbiddenException(`Sem permissão: ${CAPACIDADES[capacidade] ?? capacidade}`);
  }
}

@Controller()
@UseGuards(LogadoGuard)
export class PermissoesController {
  constructor(private db: DbService, private perms: PermissoesService) {}

  @Get('permissoes/minhas')
  minhas(@Usuario() u: UsuarioSessao) {
    return this.perms.todas(u);
  }

  @Get('admin/permissoes')
  @UseGuards(AdminGuard)
  async matriz() {
    return {
      capacidades: CAPACIDADES,
      escopos: ESCOPOS,
      papeis: PAPEIS,
      matriz: await this.db.query('SELECT papel, capacidade, escopo FROM hub.papel_permissoes'),
    };
  }

  /** A matriz é própria de cada ambiente (pode ser mais aberta no dev para testes). */
  @Put('admin/permissoes')
  @UseGuards(AdminGuard)
  async salvar(@Usuario() ator: UsuarioSessao, @Body() linhas: { papel: string; capacidade: string; escopo: string }[]) {
    if (!Array.isArray(linhas)) throw new BadRequestException('Envie uma lista');
    for (const l of linhas) {
      if (!PAPEIS.includes(l.papel) || !CAPACIDADES[l.capacidade] || !ESCOPOS.includes(l.escopo as Escopo))
        throw new BadRequestException(`Linha inválida: ${l.papel} / ${l.capacidade} / ${l.escopo}`);
    }
    await this.db.transacao(async (c) => {
      for (const l of linhas) {
        await c.query(
          `INSERT INTO hub.papel_permissoes (papel, capacidade, escopo) VALUES ($1,$2,$3)
           ON CONFLICT (papel, capacidade) DO UPDATE SET escopo = EXCLUDED.escopo`,
          [l.papel, l.capacidade, l.escopo]);
      }
    });
    this.perms.invalidar();
    await registrarAuditoria(this.db, ator, 'alterou a matriz de permissões', null, linhas);
    return { ok: true };
  }
}
