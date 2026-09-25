import {
  BadRequestException, Body, CanActivate, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param,
  ParseUUIDPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { DbService } from '../db/db.service';
import { config } from '../config';
import { AdminGuard, LogadoGuard, Usuario, UsuarioSessao } from '../auth/guards';
import { registrarAuditoria } from './auditoria';
import { planoDeSincronizacao } from './sincronizacao';

export const AMBIENTES = ['dev', 'hml', 'prod'] as const;
const PAPEIS = ['aluno', 'preceptor', 'tutor', 'coordenador', 'coordenacao_geral', 'externo'];
const PERFIS = ['desenvolvedor', 'usuario'];
const NIVEIS_GITHUB = ['nenhum', 'leitura', 'escrita', 'admin'];
const NIVEIS_BANCO = ['nenhum', 'leitura', 'escrita'];

interface PermissaoIn { ambiente: string; hub: boolean; banco: string; servidor: boolean }
interface UsuarioIn {
  nome?: string; email?: string; papel?: string; perfil?: string; grupo?: number | null;
  admin_sistema?: boolean; ativo?: boolean;
  github_usuario?: string | null; github_permissao?: string;
  usuario_servidor?: string | null; chave_ssh?: string | null;
  permissoes?: PermissaoIn[];
}

/** Acessos com que cada perfil nasce, quando o cadastro não informa nada. */
export const PADRAO_POR_PERFIL: Record<string, PermissaoIn[]> = {
  // desenvolvedor do Grupo II: desenvolve e testa no dev e no hml, e também USA o HUB no prod
  // (registra as próprias atividades); acesso técnico ao prod é só do administrador
  desenvolvedor: [
    { ambiente: 'dev', hub: true, banco: 'escrita', servidor: true },
    { ambiente: 'hml', hub: true, banco: 'leitura', servidor: true },
    { ambiente: 'prod', hub: true, banco: 'nenhum', servidor: false },
  ],
  // usuário do sistema (Grupos I, III, IV, V): só usa o HUB de produção, sem acesso técnico
  usuario: [
    { ambiente: 'dev', hub: false, banco: 'nenhum', servidor: false },
    { ambiente: 'hml', hub: false, banco: 'nenhum', servidor: false },
    { ambiente: 'prod', hub: true, banco: 'nenhum', servidor: false },
  ],
};

const CAMPOS = `id, nome, email, papel, perfil, grupo, admin_sistema, ativo, github_usuario, github_permissao,
  usuario_servidor, chave_ssh, ultimo_login, criado_em, atualizado_em, foto_versao, foto IS NOT NULL AS tem_foto`;

function senhaTemporaria() {
  return randomBytes(12).toString('base64url');
}

function validar(d: UsuarioIn, novo: boolean) {
  const erro = (m: string) => { throw new BadRequestException(m); };
  if (novo || d.nome !== undefined) if (!d.nome?.trim()) erro('Informe o nome');
  if (novo || d.email !== undefined) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email ?? '')) erro('E-mail inválido');
  if (novo || d.papel !== undefined) if (!PAPEIS.includes(d.papel ?? '')) erro('Papel inválido');
  if (d.perfil !== undefined && !PERFIS.includes(d.perfil)) erro('Perfil inválido');
  if (d.grupo != null && !(Number.isInteger(d.grupo) && d.grupo >= 1 && d.grupo <= 5)) erro('Grupo deve ser de 1 a 5');
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

/** Usuário do sistema nunca recebe acesso técnico, mesmo que o formulário mande. */
function limparAcessoTecnico(d: UsuarioIn) {
  if (d.perfil !== 'usuario') return;
  d.github_permissao = 'nenhum';
  d.permissoes = d.permissoes?.map((p) => ({ ...p, banco: 'nenhum', servidor: false }));
}

async function gravarPermissoes(c: PoolClient, id: string, permissoes: PermissaoIn[]) {
  for (const amb of AMBIENTES) {
    const p = permissoes.find((x) => x.ambiente === amb) ?? { hub: false, banco: 'nenhum', servidor: false };
    await c.query(
      `INSERT INTO hub.permissoes_ambiente (usuario_id, ambiente, hub, banco, servidor) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (usuario_id, ambiente)
       DO UPDATE SET hub = EXCLUDED.hub, banco = EXCLUDED.banco, servidor = EXCLUDED.servidor`,
      [id, amb, !!p.hub, p.banco, !!p.servidor],
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

/** Em ambiente gerenciado, a administração é somente leitura. */
@Injectable()
class SomenteNoCentral implements CanActivate {
  canActivate() {
    if (config.painelModo !== 'central')
      throw new ForbiddenException('Este ambiente é gerenciado pelo painel central. Faça a alteração lá.');
    return true;
  }
}

@Controller('admin')
@UseGuards(LogadoGuard, AdminGuard)
export class UsuariosController {
  constructor(private db: DbService) {}

  private async carregar(id: string) {
    const u = await this.db.um(`SELECT ${CAMPOS} FROM hub.usuarios WHERE id = $1`, [id]);
    if (!u) throw new NotFoundException('Pessoa não encontrada');
    u.permissoes = await this.db.query(
      'SELECT ambiente, hub, banco, servidor FROM hub.permissoes_ambiente WHERE usuario_id = $1 ORDER BY ambiente', [id],
    );
    return u;
  }

  @Get('painel')
  painel() {
    return { ambiente: config.ambiente, modo: config.painelModo, padroes: PADRAO_POR_PERFIL };
  }

  @Get('usuarios')
  async listar() {
    const us = await this.db.query(`SELECT ${CAMPOS} FROM hub.usuarios ORDER BY ativo DESC, nome`);
    const ps = await this.db.query('SELECT usuario_id, ambiente, hub, banco, servidor FROM hub.permissoes_ambiente');
    for (const u of us) u.permissoes = ps.filter((p) => p.usuario_id === u.id);
    return us;
  }

  @Get('usuarios/:id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.carregar(id);
  }

  @Post('usuarios')
  @UseGuards(SomenteNoCentral)
  async criar(@Usuario() ator: UsuarioSessao, @Body() d: UsuarioIn) {
    d.perfil ??= 'usuario';
    validar(d, true);
    d.permissoes ??= PADRAO_POR_PERFIL[d.perfil];
    limparAcessoTecnico(d);
    const senha = senhaTemporaria();
    const id = await this.db.transacao(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO hub.usuarios (nome, email, senha_hash, papel, perfil, grupo, admin_sistema,
           github_usuario, github_permissao, usuario_servidor, chave_ssh)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [d.nome!.trim(), d.email!.trim().toLowerCase(), await bcrypt.hash(senha, 12), d.papel, d.perfil, d.grupo ?? null,
          !!d.admin_sistema, d.github_usuario || null, d.github_permissao ?? 'nenhum',
          d.usuario_servidor || null, d.chave_ssh?.trim() || null],
      ).catch(traduzErroBanco);
      await gravarPermissoes(c, rows[0].id, d.permissoes!);
      return rows[0].id as string;
    });
    const u = await this.carregar(id);
    await registrarAuditoria(this.db, ator, 'criou pessoa', u, resumo(u));
    return { usuario: u, senha_temporaria: senha };
  }

  @Put('usuarios/:id')
  @UseGuards(SomenteNoCentral)
  async atualizar(@Usuario() ator: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string, @Body() d: UsuarioIn) {
    validar(d, false);
    const antes = await this.carregar(id);
    if (id === ator.id && (d.admin_sistema === false || d.ativo === false))
      throw new BadRequestException('Você não pode remover o seu próprio acesso de administrador');
    d.perfil ??= antes.perfil;
    if (d.perfil === 'usuario') d.permissoes ??= antes.permissoes; // para limpar o acesso técnico que já existia
    limparAcessoTecnico(d);

    await this.db.transacao(async (c) => {
      await c.query(
        `UPDATE hub.usuarios SET
           nome = COALESCE($2, nome), email = COALESCE($3, email), papel = COALESCE($4, papel),
           admin_sistema = COALESCE($5, admin_sistema), ativo = COALESCE($6, ativo),
           github_usuario = CASE WHEN $7::boolean THEN $8 ELSE github_usuario END,
           github_permissao = COALESCE($9, github_permissao),
           usuario_servidor = CASE WHEN $10::boolean THEN $11 ELSE usuario_servidor END,
           chave_ssh = CASE WHEN $12::boolean THEN $13 ELSE chave_ssh END,
           perfil = COALESCE($14, perfil),
           grupo = CASE WHEN $15::boolean THEN $16::smallint ELSE grupo END,
           atualizado_em = now()
         WHERE id = $1`,
        [id, d.nome?.trim(), d.email?.trim().toLowerCase(), d.papel, d.admin_sistema, d.ativo,
          d.github_usuario !== undefined, d.github_usuario || null, d.github_permissao,
          d.usuario_servidor !== undefined, d.usuario_servidor || null,
          d.chave_ssh !== undefined, d.chave_ssh?.trim() || null,
          d.perfil, d.grupo !== undefined, d.grupo ?? null],
      ).catch(traduzErroBanco);
      if (d.permissoes) await gravarPermissoes(c, id, d.permissoes);
    });
    const depois = await this.carregar(id);
    await registrarAuditoria(this.db, ator, 'alterou pessoa', depois, { antes: resumo(antes), depois: resumo(depois) });
    return depois;
  }

  @Post('usuarios/:id/redefinir-senha')
  @UseGuards(SomenteNoCentral)
  async redefinirSenha(@Usuario() ator: UsuarioSessao, @Param('id', ParseUUIDPipe) id: string) {
    const u = await this.carregar(id);
    const senha = senhaTemporaria();
    await this.db.query(
      'UPDATE hub.usuarios SET senha_hash = $2, senha_atualizada_em = now(), atualizado_em = now() WHERE id = $1',
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
    const [status, ultima, pendente] = await Promise.all([
      this.db.query('SELECT * FROM hub.sincronizacao_status'),
      this.db.um(`SELECT * FROM hub.sincronizacao_execucoes WHERE concluida_em IS NOT NULL ORDER BY concluida_em DESC LIMIT 1`),
      this.db.um(`SELECT * FROM hub.sincronizacao_execucoes WHERE concluida_em IS NULL ORDER BY pedida_em LIMIT 1`),
    ]);
    return {
      modo: config.painelModo,
      ultima_execucao: ultima ?? null,
      pedido_pendente: pendente ?? null,
      plano: planoDeSincronizacao(await this.listar(), status),
    };
  }

  @Post('sincronizacao/aplicar')
  @UseGuards(SomenteNoCentral)
  async aplicar(@Usuario() ator: UsuarioSessao) {
    const pendente = await this.db.um('SELECT id FROM hub.sincronizacao_execucoes WHERE concluida_em IS NULL LIMIT 1');
    if (!pendente)
      await this.db.query('INSERT INTO hub.sincronizacao_execucoes (pedida_por) VALUES ($1)', [ator.nome]);
    await registrarAuditoria(this.db, ator, 'pediu sincronização', null);
    return { ok: true };
  }
}

/** O que vale guardar na auditoria (sem hash de senha, sem chave inteira). */
function resumo(u: any) {
  return {
    papel: u.papel, perfil: u.perfil, grupo: u.grupo, admin_sistema: u.admin_sistema, ativo: u.ativo,
    github: u.github_usuario ? `${u.github_usuario}:${u.github_permissao}` : u.github_permissao,
    usuario_servidor: u.usuario_servidor, tem_chave_ssh: !!u.chave_ssh,
    permissoes: Object.fromEntries(
      (u.permissoes ?? []).map((p: any) => [
        p.ambiente, [p.hub && 'hub', p.banco !== 'nenhum' && `banco:${p.banco}`, p.servidor && 'servidor'].filter(Boolean).join(' ') || '-',
      ]),
    ),
  };
}
