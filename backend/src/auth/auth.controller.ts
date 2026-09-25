import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param,
  ParseUUIDPipe, Post, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { identificarDispositivo } from '../auditoria/dispositivo';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { diskStorage } from 'multer';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { COOKIE_SESSAO, config } from '../config';
import { AdminGuard, LogadoGuard, PODE_ENTRAR_AQUI, Usuario, UsuarioSessao, VER_COMO_PERMITIDO } from './guards';
import { registrarAuditoria } from '../usuarios/auditoria';
import { PASTA_EVIDENCIAS, apagarArquivos } from '../atividades/armazenamento';

const DURACAO_SESSAO_H = 12;
const PASTA_FOTOS = join(PASTA_EVIDENCIAS, 'fotos');
mkdirSync(PASTA_FOTOS, { recursive: true });
const TIPOS_FOTO: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const uploadFoto = {
  storage: diskStorage({
    destination: PASTA_FOTOS,
    filename: (_r: any, f: Express.Multer.File, cb: (e: Error | null, n: string) => void) => cb(null, randomUUID() + TIPOS_FOTO[f.mimetype]),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_r: any, f: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) =>
    TIPOS_FOTO[f.mimetype] ? cb(null, true) : cb(new BadRequestException('Use uma imagem JPG, PNG ou WebP'), false),
};

@Controller()
export class AuthController {
  constructor(private db: DbService, private jwt: JwtService) {}

  private async abrirSessao(res: Response, dados: { sub: string; por?: string }) {
    const token = await this.jwt.signAsync(dados, { expiresIn: `${DURACAO_SESSAO_H}h` });
    res.cookie(COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSeguro,
      maxAge: DURACAO_SESSAO_H * 3600 * 1000,
      path: '/',
    });
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: { email?: string; senha?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const email = (body.email ?? '').trim().toLowerCase();
    const u = await this.db.um(
      `SELECT id, nome, senha_hash, ${PODE_ENTRAR_AQUI} AS pode_entrar FROM hub.usuarios u WHERE email = $1`, [email],
    );
    // mesma mensagem para "não existe" e "senha errada"
    if (!u || !(await bcrypt.compare(body.senha ?? '', u.senha_hash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    if (!u.pode_entrar) {
      throw new UnauthorizedException(`Você não tem acesso ao HUB do ambiente ${config.ambiente}. Fale com o tutor.`);
    }
    await this.db.query('UPDATE hub.usuarios SET ultimo_login = now() WHERE id = $1', [u.id]);
    await registrarAuditoria(this.db, { id: u.id, nome: u.nome, dispositivo: identificarDispositivo(req.headers) }, 'login', null);
    await this.abrirSessao(res, { sub: u.id });
    return { ok: true };
  }

  @Post('auth/logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(COOKIE_SESSAO, { path: '/' });
    return { ok: true };
  }

  /** Quem sou eu + minhas permissões. */
  @Get('auth/eu')
  @UseGuards(LogadoGuard)
  async eu(@Usuario() u: UsuarioSessao) {
    const extra = await this.db.um(
      `SELECT perfil, grupo, github_usuario, github_permissao, usuario_servidor, senha_banco, foto_versao,
              foto IS NOT NULL AS tem_foto, chave_ssh IS NOT NULL AS tem_chave_ssh
       FROM hub.usuarios WHERE id = $1`, [u.id],
    );
    const permissoes = await this.db.query(
      'SELECT ambiente, hub, banco, servidor FROM hub.permissoes_ambiente WHERE usuario_id = $1 ORDER BY ambiente',
      [u.id],
    );
    return {
      ...u, ...extra, permissoes, ambiente: config.ambiente, painel_modo: config.painelModo,
      // no "ver como", a senha de banco da pessoa não é exibida para o administrador
      senha_banco: u.por ? null : extra.senha_banco,
      ver_como_disponivel: VER_COMO_PERMITIDO,
    };
  }

  @Post('auth/senha')
  @HttpCode(200)
  @UseGuards(LogadoGuard)
  async trocarSenha(@Usuario() u: UsuarioSessao, @Body() body: { atual?: string; nova?: string }) {
    if (u.por) throw new ForbiddenException('No modo "ver como" não é possível trocar a senha da pessoa');
    if (!body.nova || body.nova.length < 10) throw new BadRequestException('A nova senha precisa ter ao menos 10 caracteres');
    const r = await this.db.um('SELECT senha_hash FROM hub.usuarios WHERE id = $1', [u.id]);
    if (!(await bcrypt.compare(body.atual ?? '', r.senha_hash))) throw new BadRequestException('Senha atual incorreta');
    await this.db.query(
      // senha_atualizada_em: o sincronizador leva a senha mais recente para os outros ambientes
      'UPDATE hub.usuarios SET senha_hash = $2, senha_atualizada_em = now(), atualizado_em = now() WHERE id = $1',
      [u.id, await bcrypt.hash(body.nova, 12)],
    );
    await registrarAuditoria(this.db, u, 'trocou a própria senha', null);
    return { ok: true };
  }

  // ------------------------------------------------------------------ foto de perfil
  @Post('auth/foto')
  @UseGuards(LogadoGuard)
  @UseInterceptors(FileInterceptor('foto', uploadFoto))
  async trocarFoto(@Usuario() u: UsuarioSessao, @UploadedFile() f?: Express.Multer.File) {
    if (!f) throw new BadRequestException('Envie uma imagem');
    const antiga = await this.db.um('SELECT foto FROM hub.usuarios WHERE id = $1', [u.id]);
    const r = await this.db.um(
      'UPDATE hub.usuarios SET foto = $2, foto_versao = foto_versao + 1 WHERE id = $1 RETURNING foto_versao', [u.id, f.filename]);
    apagarArquivos([antiga?.foto && join('fotos', antiga.foto)]);
    return { foto_versao: r.foto_versao, tem_foto: true };
  }

  @Delete('auth/foto')
  @UseGuards(LogadoGuard)
  async removerFoto(@Usuario() u: UsuarioSessao) {
    const antiga = await this.db.um('SELECT foto FROM hub.usuarios WHERE id = $1', [u.id]);
    await this.db.query('UPDATE hub.usuarios SET foto = NULL, foto_versao = foto_versao + 1 WHERE id = $1', [u.id]);
    apagarArquivos([antiga?.foto && join('fotos', antiga.foto)]);
    return { tem_foto: false };
  }

  @Get('usuarios/:id/foto')
  @UseGuards(LogadoGuard)
  async foto(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const u = await this.db.um('SELECT foto FROM hub.usuarios WHERE id = $1', [id]);
    if (!u?.foto) throw new NotFoundException('Sem foto');
    res.setHeader('Cache-Control', 'private, max-age=86400'); // a URL muda com foto_versao
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(join(PASTA_FOTOS, u.foto));
  }

  // ------------------------------------------------------------------ "ver como" (dev e hml)
  @Post('admin/ver-como/:id')
  @HttpCode(200)
  @UseGuards(LogadoGuard, AdminGuard)
  async verComo(@Usuario() admin: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    if (!VER_COMO_PERMITIDO) throw new ForbiddenException('"Ver como" não existe em produção');
    if (admin.por) throw new BadRequestException('Volte para a sua conta antes');
    const alvo = await this.db.um(
      `SELECT id, nome, ${PODE_ENTRAR_AQUI} AS pode_entrar FROM hub.usuarios u WHERE id = $1`, [id]);
    if (!alvo) throw new NotFoundException('Pessoa não encontrada');
    if (!alvo.pode_entrar) throw new BadRequestException(`${alvo.nome} não tem acesso ao HUB deste ambiente`);
    await registrarAuditoria(this.db, admin, 'começou a ver o sistema como', alvo);
    await this.abrirSessao(res, { sub: alvo.id, por: admin.id });
    return { ok: true };
  }

  @Post('auth/voltar')
  @HttpCode(200)
  @UseGuards(LogadoGuard)
  async voltar(@Usuario() u: UsuarioSessao, @Res({ passthrough: true }) res: Response) {
    if (!u.por) throw new BadRequestException('Você já está na sua conta');
    await registrarAuditoria(this.db, { id: u.por.id, nome: u.por.nome }, 'voltou para a própria conta', u);
    await this.abrirSessao(res, { sub: u.por.id });
    return { ok: true };
  }
}
