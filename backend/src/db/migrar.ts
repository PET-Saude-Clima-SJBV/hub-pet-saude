import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';
import { config } from '../config';

const PASTA = join(__dirname, '..', '..', 'migrations');

/** Aplica, em ordem, os arquivos migrations/NNN_*.sql que ainda não rodaram. */
export async function migrar(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS public.hub_migracoes (
    nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())`);
  const feitas = new Set(
    (await pool.query<{ nome: string }>('SELECT nome FROM public.hub_migracoes')).rows.map((r) => r.nome),
  );
  const arquivos = readdirSync(PASTA).filter((f) => f.endsWith('.sql')).sort();

  for (const arq of arquivos) {
    if (feitas.has(arq)) continue;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(readFileSync(join(PASTA, arq), 'utf8'));
      await c.query('INSERT INTO public.hub_migracoes (nome) VALUES ($1)', [arq]);
      await c.query('COMMIT');
      console.log(`[migração] aplicada: ${arq}`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`Falha na migração ${arq}: ${(e as Error).message}`);
    } finally {
      c.release();
    }
  }
}

/** Cria o primeiro administrador do sistema, se ainda não existir nenhum. */
export async function criarAdminInicial(pool: Pool) {
  const { email, nome, senhaInicial } = config.admin;
  const existe = await pool.query('SELECT 1 FROM hub.usuarios WHERE admin_sistema LIMIT 1');
  if (existe.rowCount) return;
  if (!email || !senhaInicial) {
    console.warn('[admin] Nenhum administrador e ADMIN_EMAIL/ADMIN_SENHA_INICIAL não definidos.');
    return;
  }
  const { rows } = await pool.query(
    `INSERT INTO hub.usuarios (nome, email, senha_hash, papel, admin_sistema, github_permissao)
     VALUES ($1, $2, $3, 'tutor', true, 'admin') RETURNING id`,
    [nome, email.toLowerCase(), await bcrypt.hash(senhaInicial, 12)],
  );
  await pool.query(
    `INSERT INTO hub.permissoes_ambiente (usuario_id, ambiente, banco, servidor)
     SELECT $1, a, 'escrita', true FROM unnest(ARRAY['dev','hml','prod']) a`,
    [rows[0].id],
  );
  console.log(`[admin] Administrador inicial criado: ${email}`);
}
