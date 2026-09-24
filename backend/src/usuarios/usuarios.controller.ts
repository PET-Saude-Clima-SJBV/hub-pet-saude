import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { AdminGuard, LogadoGuard, Usuario, UsuarioSessao } from '../auth/guards';
import { registrarAuditoria } from './auditoria';
import { planoDeSincronizacao } from './sincronizacao';

export const AMBIENTES = ['dev', 'hml', 'prod'] as const;
const PAPEIS = ['aluno', 'preceptor', 'tutor', 'coordenador', 'coordenacao_geral', 'externo'];
const NIVEIS_GITHUB = ['nenhum', 'leitura', 'escrita', 'admin'];
const NIVEIS_BANCO = ['nenhum', 'leitura', 'escrita'];

interface PermissaoIn { ambiente: string; banco: string; servidor: boolean }
interface UsuarioIn {
  nome?: string; email?: string; papel?: string; admin_sistema?: boolean; ativo?: boolean;
  github_usuario?: string | null; github_permissao?: string;
  usuario_servidor?: string | null; chave_ssh?: string | null;
  permissoes?: PermissaoIn[];
}

const CAMPOS = `id, nome, email, papel, admin_sistema, ativo, github_usuario, github_permissao,
  usuario_servidor, chave_ssh, ultimo_login, criado_em, atualizado_em`;

function senhaTemporaria() {
  return randomBytes(12).toString('base64url');
}

function validar(d: UsuarioIn, novo: boolean) {
  const erro = (m: string) => { throw new BadRequestException(m); };
  if (novo || d.nome !== undefined) if (!d.nome?.trim()) erro('Informe o nome');
  if (novo || d.email !== undefined) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email ?? '')) erro('E-mail inválido');
  if (novo || d.papel !== undefined) if (!PAPEIS.includes(d.papel ?? '')) erro('Papel inválido');
  if (d.github_permissao !== undefined && !NIVEIS_GITHUB.includes(d.github_permissao)) erro('Permissão GitHub inválida');
  if (d.github_usuario && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(d.github_usuario)) erro('Usuário GitHub inválido');
  if (d.usuario_servidor && !/^[a-z][a-z0-9_]{2,30}$/.test(d.usuario_servidor))
    erro('Usuário do servidor: letras minúsculas, números e _ (3 a 31 caracteres, começando por letra)');
  if (d.chave_ssh && !/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256) [A-Za-z0-9+/=]+( .*)?$/.test(d.chave_ssh.trim()))
    erro('Chave SSH pública inválida (deve começar com ssh-ed25519, ssh-rsa ou ecdsa-...)');
  for (const p of d.permissoes ?? []) {
    if (!AMBIENTES.includes(p.ambiente as any)) erro(`Ambiente inválido: ${p.ambiente}`);
    if (!NIVEIS_BANCO.includes(p.banco)) erro(`Nível de banco inválido: ${p.banco}`);
  }
}

async function gravarPermissoes(c: PoolClient, id: string, permissoes: PermissaoIn[]) {
  for (const amb of AMBIENTES) {
    const p = permissoes.find((x) => x.ambiente === amb) ?? { banco: 'nenhum', servidor: false };
    await c.query(
      `INSERT INTO hub.permissoes_ambiente (usuario_id, ambiente, banco, servidor) VALUES ($1,$2,$3,$4)
       ON CONFLICT (usuario_id, ambiente) DO UPDATE SET banco = EXCLUDED.banco, servidor = EXCLUDED.servidor`,
      [id, amb, p.banco, !!p.servidor],
    );
  }
}

function traduzErroBanco(e: any): never {
  if (e?.code === '23505') {
    if (String(e.constraint).includes('email')) throw new BadRequestException('Já existe uma pessoa com este e-mail');
    if (String(e.constraint).includes('usuario_servidor')) throw new BadRequestException('Usuário do servidor já está em uso');
  }
  throw e;
}

@Controller('admin')
@UseGuards(LogadoGuard, AdminGuard)
export class UsuariosController {
  constructor(private db: DbService) {}

  private async carregar(id: string) {
    const u = await this.db.um(`SELECT ${CAMPOS} FROM hub.usuarios WHERE id = $1`, [id]);
    if (!u) throw new NotFoundException('Pessoa não encontrada');
    u.permissoes = await this.db.query(
      'SELECT ambiente, banco, servidor FROM hub.permissoes_ambiente WHERE usuario_id = $1 ORDER BY ambiente', [id],
    );
    return u;
  }

  @Get('usuarios')
  async listar() {
    const us = await this.db.query(`SELECT ${CAMPOS} FROM hub.usuarios ORDER BY ativo DESC, nome`);
    const ps = await this.db.query('SELECT usuario_id, ambiente, banco, servidor FROM hub.permissoes_ambiente');
    for (const u of us) u.permissoes = ps.filter((p) => p.usuario_id === u.id);
    return us;
  }

  @Get('usuarios/:id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.carregar(id);
  }

  @Post('usuarios')
  async criar(@Usuario() ator: UsuarioSessao, @Body() d: UsuarioIn) {
    validar(d, true);
    const senha = senhaTemporaria();
    const id = await this.db.transacao(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO hub.usuarios (nome, email, senha_hash, papel, admin_sistema, github_usuario, github_permissao,
           usuario_servidor, chave_ssh)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [d.nome!.trim(), d.email!.trim().toLowerCase(), await bcrypt.hash(senha, 12), d.papel, !!d.admin_sistema,
          d.github_usuario || null, d.github_permissao ?? 'nenhum', d.usuario_servidor || null, d.chave_ssh?.trim() || null],
      ).catch(traduzErroBanco);
      await gravarPermissoes(c, rows[0].id, d.permissoes ?? []);
      return rows[0].id as string;
    });
    const u = await this.carregar(id);
    await registrarAuditoria(this.db, ator, 'criou pessoa', u, resumo(u));
    return { usuario: u, senha_temporaria: senha };
  }

  @Put('usuarios/:id')
  async atualizar(@Usuario() ator: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string, @Body() d: UsuarioIn) {
    validar(d, false);
    const antes = await this.carregar(id);
    if (id === ator.id && (d.admin_sistema === false || d.ativo === false))
      throw new BadRequestException('Você não pode remover o seu próprio acesso de administrador');

    await this.db.transacao(async (c) => {
      await c.query(
        `UPDATE hub.usuarios SET
           nome = COALESCE($2, nome), email = COALESCE($3, email), papel = COALESCE($4, papel),
           admin_sistema = COALESCE($5, admin_sistema), ativo = COALESCE($6, ativo),
           github_usuario = CASE WHEN $7::boolean THEN $8 ELSE github_usuario END,
           github_permissao = COALESCE($9, github_permissao),
           usuario_servidor = CASE WHEN $10::boolean THEN $11 ELSE usuario_servidor END,
           chave_ssh = CASE WHEN $12::boolean THEN $13 ELSE chave_ssh END,
           atualizado_em = now()
         WHERE id = $1`,
        [id, d.nome?.trim(), d.email?.trim().toLowerCase(), d.papel, d.admin_sistema, d.ativo,
          d.github_usuario !== undefined, d.github_usuario || null, d.github_permissao,
          d.usuario_servidor !== undefined, d.usuario_servidor || null,
          d.chave_ssh !== undefined, d.chave_ssh?.trim() || null],
      ).catch(traduzErroBanco);
      if (d.permissoes) await gravarPermissoes(c, id, d.permissoes);
    });
    const depois = await this.carregar(id);
    await registrarAuditoria(this.db, ator, 'alterou pessoa', depois, { antes: resumo(antes), depois: resumo(depois) });
    return depois;
  }

  @Post('usuarios/:id/redefinir-senha')
  async redefinirSenha(@Usuario() ator: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string) {
    const u = await this.carregar(id);
    const senha = senhaTemporaria();
    await this.db.query('UPDATE hub.usuarios SET senha_hash = $2, atualizado_em = now() WHERE id = $1',
      [id, await bcrypt.hash(senha, 12)]);
    await registrarAuditoria(this.db, ator, 'redefiniu senha', u);
    return { senha_temporaria: senha };
  }

  @Get('auditoria')
  auditoria(@Query('limite') limite?: string) {
    const n = Math.min(Math.max(Number(limite) || 100, 1), 500);
    return this.db.query('SELECT * FROM hub.auditoria ORDER BY quando DESC LIMIT $1', [n]);
  }

  @Get('sincronizacao')
  async sincronizacao() {
    return planoDeSincronizacao(await this.listar());
  }
}

/** O que vale guardar na auditoria (sem hash de senha, sem chave inteira). */
function resumo(u: any) {
  return {
    papel: u.papel, admin_sistema: u.admin_sistema, ativo: u.ativo,
    github: u.github_usuario ? `${u.github_usuario}:${u.github_permissao}` : u.github_permissao,
    usuario_servidor: u.usuario_servidor, tem_chave_ssh: !!u.chave_ssh,
    permissoes: Object.fromEntries(
      (u.permissoes ?? []).map((p: any) => [p.ambiente, `banco:${p.banco}${p.servidor ? ' +servidor' : ''}`]),
    ),
  };
}
