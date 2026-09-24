import {
  BadRequestException, Body, Controller, Get, HttpCode, Post, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { COOKIE_SESSAO, config } from '../config';
import { LogadoGuard, Usuario, UsuarioSessao } from './guards';
import { registrarAuditoria } from '../usuarios/auditoria';

const DURACAO_SESSAO_H = 12;

@Controller('auth')
export class AuthController {
  constructor(private db: DbService, private jwt: JwtService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { email?: string; senha?: string }, @Res({ passthrough: true }) res: Response) {
    const email = (body.email ?? '').trim().toLowerCase();
    const u = await this.db.um(
      'SELECT id, nome, senha_hash, ativo FROM hub.usuarios WHERE email = $1', [email],
    );
    // mesma mensagem para "não existe" e "senha errada"
    if (!u || !u.ativo || !(await bcrypt.compare(body.senha ?? '', u.senha_hash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    await this.db.query('UPDATE hub.usuarios SET ultimo_login = now() WHERE id = $1', [u.id]);
    await registrarAuditoria(this.db, { id: u.id, nome: u.nome }, 'login', null);

    const token = await this.jwt.signAsync({ sub: u.id }, { expiresIn: `${DURACAO_SESSAO_H}h` });
    res.cookie(COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSeguro,
      maxAge: DURACAO_SESSAO_H * 3600 * 1000,
      path: '/',
    });
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_SESSAO, { path: '/' });
    return { ok: true };
  }

  /** Quem sou eu + minhas permissões. */
  @Get('eu')
  @UseGuards(LogadoGuard)
  async eu(@Usuario() u: UsuarioSessao) {
    const extra = await this.db.um(
      'SELECT github_usuario, github_permissao, usuario_servidor FROM hub.usuarios WHERE id = $1', [u.id],
    );
    const permissoes = await this.db.query(
      'SELECT ambiente, banco, servidor FROM hub.permissoes_ambiente WHERE usuario_id = $1 ORDER BY ambiente',
      [u.id],
    );
    return { ...u, ...extra, permissoes };
  }

  @Post('senha')
  @HttpCode(200)
  @UseGuards(LogadoGuard)
  async trocarSenha(@Usuario() u: UsuarioSessao, @Body() body: { atual?: string; nova?: string }) {
    if (!body.nova || body.nova.length < 10) throw new BadRequestException('A nova senha precisa ter ao menos 10 caracteres');
    const r = await this.db.um('SELECT senha_hash FROM hub.usuarios WHERE id = $1', [u.id]);
    if (!(await bcrypt.compare(body.atual ?? '', r.senha_hash))) throw new BadRequestException('Senha atual incorreta');
    await this.db.query(
      'UPDATE hub.usuarios SET senha_hash = $2, atualizado_em = now() WHERE id = $1',
      [u.id, await bcrypt.hash(body.nova, 12)],
    );
    await registrarAuditoria(this.db, u, 'trocou a própria senha', null);
    return { ok: true };
  }
}
