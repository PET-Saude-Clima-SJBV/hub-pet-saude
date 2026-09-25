import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get, Injectable, NotFoundException, Param, Put,
  ServiceUnavailableException, SetMetadata, UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DbService } from '../db/db.service';
import { AdminGuard, LogadoGuard, Usuario, UsuarioSessao } from '../auth/guards';
import { registrarAuditoria } from '../usuarios/auditoria';

export type EstadoFuncionalidade = 'desligada' | 'teste' | 'ligada';
const ESTADOS: EstadoFuncionalidade[] = ['desligada', 'teste', 'ligada'];
const CACHE_MS = 5000;

/**
 * Chaves de funcionalidade: cada contexto do sistema pode ser desligado, deixado em teste
 * (só administradores e desenvolvedores) ou ligado, a qualquer momento e por ambiente.
 */
@Injectable()
export class FuncionalidadesService {
  private cache: { em: number; estados: Map<string, EstadoFuncionalidade> } | null = null;

  constructor(private db: DbService) {}

  async estados() {
    if (!this.cache || Date.now() - this.cache.em > CACHE_MS) {
      const linhas = await this.db.query('SELECT chave, estado FROM hub.funcionalidades');
      this.cache = { em: Date.now(), estados: new Map(linhas.map((l) => [l.chave, l.estado])) };
    }
    return this.cache.estados;
  }

  invalidar() {
    this.cache = null;
  }

  /** A funcionalidade está disponível para esta pessoa (ou para o público, se `u` for vazio)? */
  async disponivel(chave: string, u?: UsuarioSessao | null) {
    const estado = (await this.estados()).get(chave) ?? 'desligada';
    if (estado === 'ligada') return true;
    if (estado === 'teste') return !!u && (u.admin_sistema || u.perfil === 'desenvolvedor');
    return false;
  }

  async disponiveis(u?: UsuarioSessao | null) {
    const r: Record<string, boolean> = {};
    for (const chave of (await this.estados()).keys()) r[chave] = await this.disponivel(chave, u);
    return r;
  }
}

const CHAVE_META = 'hub:funcionalidade';
/** Marca um controller (ou rota) como parte de uma funcionalidade. */
export const Funcionalidade = (chave: string) => SetMetadata(CHAVE_META, chave);

/** Recusa a requisição se a funcionalidade estiver desligada. Usar depois do LogadoGuard (quando houver login). */
@Injectable()
export class FuncionalidadeGuard implements CanActivate {
  constructor(private reflector: Reflector, private funcs: FuncionalidadesService) {}

  async canActivate(ctx: ExecutionContext) {
    const chave = this.reflector.getAllAndOverride<string>(CHAVE_META, [ctx.getHandler(), ctx.getClass()]);
    if (!chave) return true;
    const u = ctx.switchToHttp().getRequest().usuario as UsuarioSessao | undefined;
    if (!(await this.funcs.disponivel(chave, u)))
      throw new ServiceUnavailableException('Esta funcionalidade está desabilitada no momento.');
    return true;
  }
}

@Controller()
@UseGuards(LogadoGuard)
export class FuncionalidadesController {
  constructor(private db: DbService, private funcs: FuncionalidadesService) {}

  @Get('funcionalidades/minhas')
  minhas(@Usuario() u: UsuarioSessao) {
    return this.funcs.disponiveis(u);
  }

  @Get('admin/funcionalidades')
  @UseGuards(AdminGuard)
  listar() {
    return this.db.query('SELECT * FROM hub.funcionalidades ORDER BY nome');
  }

  @Put('admin/funcionalidades/:chave')
  @UseGuards(AdminGuard)
  async alterar(@Usuario() ator: UsuarioSessao, @Param('chave') chave: string, @Body() d: { estado?: string }) {
    if (!ESTADOS.includes(d.estado as EstadoFuncionalidade)) throw new BadRequestException('Estado inválido');
    const antes = await this.db.um('SELECT * FROM hub.funcionalidades WHERE chave = $1', [chave]);
    if (!antes) throw new NotFoundException('Funcionalidade não encontrada');
    const r = await this.db.um(
      `UPDATE hub.funcionalidades SET estado = $2, atualizado_em = now(), atualizado_por = $3 WHERE chave = $1 RETURNING *`,
      [chave, d.estado, ator.nome]);
    this.funcs.invalidar();
    await registrarAuditoria(this.db, ator, `funcionalidade "${antes.nome}": ${antes.estado} → ${d.estado}`, null);
    return r;
  }
}
