import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DbService } from '../db/db.service';
import { COOKIE_SESSAO, config } from '../config';

/** Condição SQL: a pessoa (hub.usuarios u) pode entrar no HUB deste ambiente. */
export const PODE_ENTRAR_AQUI = config.ambiente === 'local'
  ? 'u.ativo'
  : `u.ativo AND EXISTS (SELECT 1 FROM hub.permissoes_ambiente p
       WHERE p.usuario_id = u.id AND p.ambiente = '${config.ambiente}' AND p.hub)`;

export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
  papel: string;
  perfil: 'desenvolvedor' | 'usuario';
  grupo: number | null;
  admin_sistema: boolean;
}

/** Exige login. Recarrega a pessoa do banco a cada requisição (desativou = perde acesso na hora). */
@Injectable()
export class LogadoGuard implements CanActivate {
  constructor(private jwt: JwtService, private db: DbService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request & { usuario?: UsuarioSessao }>();
    const token = req.cookies?.[COOKIE_SESSAO];
    if (!token) throw new UnauthorizedException('Faça login');
    let sub: string;
    try {
      sub = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw new UnauthorizedException('Sessão expirada');
    }
    const u = await this.db.um<UsuarioSessao>(
      `SELECT id, nome, email, papel, perfil, grupo, admin_sistema FROM hub.usuarios u WHERE id = $1 AND ${PODE_ENTRAR_AQUI}`,
      [sub],
    );
    if (!u) throw new UnauthorizedException('Sem acesso a este ambiente');
    req.usuario = u;
    return true;
  }
}

/** Exige login + flag "Administrador do sistema". Usar junto com LogadoGuard. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const u = ctx.switchToHttp().getRequest().usuario as UsuarioSessao | undefined;
    if (!u?.admin_sistema) throw new ForbiddenException('Apenas administradores do sistema');
    return true;
  }
}

export const Usuario = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().usuario as UsuarioSessao,
);
