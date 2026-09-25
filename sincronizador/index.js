#!/usr/bin/env node
/**
 * Sincronizador do HUB: lê as pessoas e permissões do PAINEL CENTRAL e aplica:
 *   HUB      -> conta de login em cada ambiente (dev/hml/prod) onde a pessoa tem acesso
 *   Banco    -> usuário PostgreSQL com leitura ou escrita em cada ambiente
 *   Servidor -> conta linux só-túnel, liberando apenas as portas dos ambientes marcados
 *   GitHub   -> time da organização (via GitHub App, se configurado)
 * e grava o resultado em hub.sincronizacao_status (visto na tela "Sincronização").
 *
 * Roda como root, por um timer do systemd a cada minuto. Faz a sincronização completa
 * quando há um pedido ("Aplicar agora") ou quando a última passou de INTERVALO_MIN.
 * Uso manual: node index.js [--forcar]
 */
const { Client } = require('pg');
const { execFileSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync, chownSync } = require('fs');
const { randomBytes } = require('crypto');
const { sincronizarGithub } = require('./github');

const AMBIENTES = ['dev', 'hml', 'prod'];
const PORTA = { dev: 5433, hml: 5434, prod: 5432 };
const BASE = '/opt/hub-saude';
const SSHD_ARQ = '/etc/ssh/sshd_config.d/40-hub-usuarios.conf';
const GRUPO_TUNEL = 'tunel-db';
const MARCA_ROLE = 'gerenciado pelo sincronizador do HUB';
const TIMES = { leitura: 'hub-leitura', escrita: 'hub-desenvolvimento', admin: 'hub-administradores' };

const cfg = {
  central: process.env.CENTRAL ?? 'prod',
  // ambientes em que o sincronizador pode mexer (o central sempre entra)
  gerenciados: (process.env.AMBIENTES ?? 'dev,hml,prod').split(',').map((s) => s.trim())
    .filter((a) => AMBIENTES.includes(a)),
  intervaloMin: Number(process.env.INTERVALO_MIN ?? 10),
  github: process.env.GITHUB_APP_ID && process.env.GITHUB_APP_CHAVE ? {
    appId: process.env.GITHUB_APP_ID,
    chaveArquivo: process.env.GITHUB_APP_CHAVE,
    org: process.env.GITHUB_ORG ?? 'PET-Saude-Clima-SJBV',
    repo: process.env.GITHUB_REPO ?? 'hub-pet-saude',
  } : null,
};

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });

function lerEnv(amb) {
  const f = `${BASE}/${amb}/.env`;
  if (!existsSync(f)) return null;
  return Object.fromEntries(readFileSync(f, 'utf8').split('\n')
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
}

async function conectar(amb) {
  const env = lerEnv(amb);
  if (!env) return null;
  const c = new Client({
    host: '127.0.0.1', port: Number(env.DB_PORT), database: env.POSTGRES_DB,
    user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD,
  });
  try {
    await c.connect();
  } catch (e) {
    log(`[${amb}] banco indisponível: ${e.message}`);
    return null;
  }
  const temHub = (await c.query(`SELECT to_regclass('hub.usuarios') IS NOT NULL AS ok`)).rows[0].ok;
  return { amb, c, temHub };
}

const ident = (s) => {
  if (!/^[a-z][a-z0-9_]{2,30}$/.test(s)) throw new Error(`identificador inválido: ${s}`);
  return `"${s}"`;
};
const literal = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ---------------------------------------------------------------- estado desejado
function estadoDesejado(pessoas) {
  const AMBIENTES = cfg.gerenciados; // o que está fora da lista não é tocado
  return pessoas.map((u) => {
    const perms = Object.fromEntries(u.permissoes.map((p) => [p.ambiente, p]));
    const ativo = u.ativo;
    const tecnico = u.perfil === 'desenvolvedor' && ativo;
    return {
      u,
      hub: AMBIENTES.filter((a) => ativo && perms[a]?.hub),
      banco: Object.fromEntries(AMBIENTES
        .filter((a) => tecnico && u.usuario_servidor && perms[a] && perms[a].banco !== 'nenhum')
        .map((a) => [a, perms[a].banco])),
      tunel: tecnico && u.usuario_servidor && u.chave_ssh ? AMBIENTES.filter((a) => perms[a]?.servidor) : [],
      github: tecnico && u.github_usuario && u.github_permissao !== 'nenhum'
        ? { login: u.github_usuario, time: TIMES[u.github_permissao] } : null,
    };
  });
}

// ---------------------------------------------------------------- HUB (réplicas)
const COLUNAS = ['id', 'nome', 'email', 'senha_hash', 'senha_atualizada_em', 'papel', 'perfil', 'grupo',
  'admin_sistema', 'ativo', 'github_usuario', 'github_permissao', 'usuario_servidor', 'senha_banco'];

/** Senha trocada num ambiente gerenciado sobe para o central (vence a mais recente). */
async function trazerSenhasNovas(central, replicas) {
  for (const r of replicas) {
    const { rows } = await r.c.query('SELECT id, senha_hash, senha_atualizada_em FROM hub.usuarios');
    for (const x of rows) {
      const n = await central.c.query(
        `UPDATE hub.usuarios SET senha_hash = $2, senha_atualizada_em = $3
         WHERE id = $1 AND senha_atualizada_em < $3`, [x.id, x.senha_hash, x.senha_atualizada_em]);
      if (n.rowCount) log(`[HUB] senha de ${x.id} veio do ${r.amb}`);
    }
  }
}

async function replicarHub(r, desejado, status) {
  const aqui = desejado.filter((d) => d.hub.includes(r.amb));
  const ids = aqui.map((d) => d.u.id);
  await r.c.query('BEGIN');
  try {
    // remove quem não deve mais entrar aqui, e contas antigas com o mesmo e-mail e outro id
    await r.c.query('DELETE FROM hub.usuarios WHERE NOT (id = ANY($1::uuid[]))', [ids]);
    for (const { u } of aqui) {
      await r.c.query('DELETE FROM hub.usuarios WHERE email = $1 AND id <> $2', [u.email, u.id]);
      const valores = COLUNAS.map((k) => u[k]);
      await r.c.query(
        `INSERT INTO hub.usuarios (${COLUNAS.join(',')}) VALUES (${COLUNAS.map((_, i) => `$${i + 1}`).join(',')})
         ON CONFLICT (id) DO UPDATE SET ${COLUNAS.slice(1).map((k) => `${k} = EXCLUDED.${k}`).join(', ')},
           atualizado_em = now()`, valores);
      for (const p of u.permissoes) {
        await r.c.query(
          `INSERT INTO hub.permissoes_ambiente (usuario_id, ambiente, hub, banco, servidor) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (usuario_id, ambiente) DO UPDATE SET hub = $3, banco = $4, servidor = $5`,
          [u.id, p.ambiente, p.hub, p.banco, p.servidor]);
      }
    }
    await r.c.query('COMMIT');
    for (const id of ids) status.push([id, 'HUB', r.amb, 'aplicado', null]);
  } catch (e) {
    await r.c.query('ROLLBACK');
    for (const id of ids) status.push([id, 'HUB', r.amb, 'erro', e.message]);
  }
}

// ---------------------------------------------------------------- Banco
async function garantirGrupos(r) {
  await r.c.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hub_leitura') THEN CREATE ROLE hub_leitura NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hub_escrita') THEN CREATE ROLE hub_escrita NOLOGIN; END IF;
    END $$;
    GRANT CONNECT ON DATABASE ${ident(r.c.database)} TO hub_leitura, hub_escrita;
    GRANT USAGE ON SCHEMA public TO hub_leitura;
    GRANT USAGE, CREATE ON SCHEMA public TO hub_escrita;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO hub_leitura, hub_escrita;
    GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO hub_escrita;
    GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO hub_escrita;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO hub_leitura;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hub_escrita;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hub_escrita;
    ALTER DEFAULT PRIVILEGES FOR ROLE hub_escrita IN SCHEMA public GRANT SELECT ON TABLES TO hub_leitura;`);
}

async function sincronizarBanco(r, desejado, status) {
  const alvo = desejado.filter((d) => d.banco[r.amb]);
  const gerenciados = (await r.c.query(
    `SELECT rolname FROM pg_roles r JOIN pg_shdescription d ON d.objoid = r.oid WHERE d.description = $1`,
    [MARCA_ROLE])).rows.map((x) => x.rolname);
  if (!alvo.length && !gerenciados.length) return;
  await garantirGrupos(r);

  for (const { u, banco } of alvo) {
    const nome = u.usuario_servidor;
    const nivel = banco[r.amb];
    try {
      const existe = (await r.c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [nome])).rowCount;
      if (existe && !gerenciados.includes(nome)) throw new Error(`já existe um usuário "${nome}" no banco que não é do sincronizador`);
      await r.c.query(`${existe ? 'ALTER' : 'CREATE'} ROLE ${ident(nome)} LOGIN PASSWORD ${literal(u.senha_banco)} CONNECTION LIMIT 10`);
      await r.c.query(`COMMENT ON ROLE ${ident(nome)} IS ${literal(MARCA_ROLE)}`);
      const [dar, tirar] = nivel === 'escrita' ? ['hub_escrita', 'hub_leitura'] : ['hub_leitura', 'hub_escrita'];
      await r.c.query(`GRANT ${dar} TO ${ident(nome)}`);
      await r.c.query(`REVOKE ${tirar} FROM ${ident(nome)}`);
      // quem escreve cria objetos como hub_escrita, para os colegas também poderem alterar
      await r.c.query(nivel === 'escrita' ? `ALTER ROLE ${ident(nome)} SET role = 'hub_escrita'` : `ALTER ROLE ${ident(nome)} RESET role`);
      status.push([u.id, 'Banco', r.amb, 'aplicado', `${nivel} em ${r.c.database}`]);
    } catch (e) {
      status.push([u.id, 'Banco', r.amb, 'erro', e.message]);
    }
  }

  const querem = new Set(alvo.map((d) => d.u.usuario_servidor));
  for (const nome of gerenciados.filter((n) => !querem.has(n))) {
    try {
      await r.c.query(`DROP ROLE ${ident(nome)}`);
    } catch {
      await r.c.query(`ALTER ROLE ${ident(nome)} NOLOGIN`); // ainda é dono de algo: só bloqueia
    }
    log(`[Banco ${r.amb}] removido ${nome}`);
  }
}

// ---------------------------------------------------------------- Servidor (túnel SSH)
function membrosDoGrupo() {
  try {
    return sh('getent', ['group', GRUPO_TUNEL]).trim().split(':')[3]?.split(',').filter(Boolean) ?? [];
  } catch {
    return [];
  }
}

function sincronizarServidor(desejado, status) {
  const alvo = desejado.filter((d) => d.tunel.length);
  const blocos = [];

  for (const { u, tunel } of alvo) {
    const nome = u.usuario_servidor;
    try {
      let existe = true;
      try { sh('id', [nome]); } catch { existe = false; }
      if (existe && !membrosDoGrupo().includes(nome)) throw new Error(`já existe um usuário linux "${nome}" que não é de túnel`);
      if (!existe) sh('useradd', ['-m', '-s', '/usr/sbin/nologin', '-G', GRUPO_TUNEL, nome]);
      const dir = `/home/${nome}/.ssh`;
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(`${dir}/authorized_keys`, u.chave_ssh.trim() + '\n', { mode: 0o600 });
      const uid = Number(sh('id', ['-u', nome]).trim());
      const gid = Number(sh('id', ['-g', nome]).trim());
      chownSync(dir, uid, gid);
      chownSync(`${dir}/authorized_keys`, uid, gid);
      const portas = tunel.flatMap((a) => [`localhost:${PORTA[a]}`, `127.0.0.1:${PORTA[a]}`]).join(' ');
      blocos.push(`Match User ${nome}\n    PermitOpen ${portas}\n`);
      status.push([u.id, 'Servidor', '-', 'aplicado', `túnel até ${tunel.join(', ')}`]);
    } catch (e) {
      status.push([u.id, 'Servidor', '-', 'erro', e.message]);
    }
  }

  // remove contas de túnel de quem não deve mais ter
  const querem = new Set(alvo.map((d) => d.u.usuario_servidor));
  for (const nome of membrosDoGrupo().filter((n) => !querem.has(n))) {
    try { sh('pkill', ['-u', nome]); } catch { /* sem sessões */ }
    sh('userdel', ['-r', nome]);
    log(`[Servidor] conta de túnel removida: ${nome}`);
  }

  const novo = `# Gerado pelo sincronizador do HUB - não edite à mão.\n# Portas liberadas por pessoa (vem antes do 50-tunel-db.conf).\n\n${blocos.join('\n')}`;
  const antigo = existsSync(SSHD_ARQ) ? readFileSync(SSHD_ARQ, 'utf8') : '';
  if (novo !== antigo) {
    writeFileSync(SSHD_ARQ, novo, { mode: 0o644 });
    try {
      sh('sshd', ['-t']);
      sh('systemctl', ['reload', 'ssh']);
    } catch (e) {
      writeFileSync(SSHD_ARQ, antigo, { mode: 0o644 }); // configuração inválida: volta a anterior
      throw new Error(`sshd rejeitou a configuração: ${e.stderr || e.message}`);
    }
  }
}

// ---------------------------------------------------------------- principal
async function main() {
  const forcar = process.argv.includes('--forcar');
  const central = await conectar(cfg.central);
  if (!central?.temHub) throw new Error(`Painel central (${cfg.central}) indisponível ou sem o HUB publicado`);

  const pedido = (await central.c.query(
    'SELECT id FROM hub.sincronizacao_execucoes WHERE concluida_em IS NULL ORDER BY pedida_em LIMIT 1')).rows[0];
  const ultima = (await central.c.query(
    'SELECT max(concluida_em) AS em FROM hub.sincronizacao_execucoes')).rows[0].em;
  const venceu = !ultima || Date.now() - new Date(ultima).getTime() > cfg.intervaloMin * 60_000;
  if (!forcar && !pedido && !venceu) { await central.c.end(); return; }

  const execId = pedido?.id ?? (await central.c.query(
    `INSERT INTO hub.sincronizacao_execucoes (pedida_por) VALUES ('automático') RETURNING id`)).rows[0].id;
  await central.c.query('UPDATE hub.sincronizacao_execucoes SET iniciada_em = now() WHERE id = $1', [execId]);
  if (!cfg.gerenciados.includes(cfg.central)) cfg.gerenciados.push(cfg.central);
  const outros = cfg.gerenciados.filter((a) => a !== cfg.central);
  log(`sincronização #${execId} (central: ${cfg.central}; gerencia: ${cfg.gerenciados.join(', ')})`);

  const conexoes = [central];
  const status = []; // [usuario_id, sistema, ambiente, estado, mensagem]
  const erros = [];
  try {
    for (const a of outros) {
      const r = await conectar(a);
      if (r) conexoes.push(r);
    }
    const replicas = conexoes.filter((r) => r !== central && r.temHub);
    await trazerSenhasNovas(central, replicas);

    // senha de banco: gerada uma vez por pessoa, igual em todos os ambientes
    await central.c.query(`UPDATE hub.usuarios SET senha_banco = substr(md5(random()::text || id::text), 1, 20)
      WHERE senha_banco IS NULL AND usuario_servidor IS NOT NULL AND perfil = 'desenvolvedor'`);

    const pessoas = (await central.c.query('SELECT * FROM hub.usuarios')).rows;
    const perms = (await central.c.query('SELECT * FROM hub.permissoes_ambiente')).rows;
    for (const p of pessoas) p.permissoes = perms.filter((x) => x.usuario_id === p.id);
    const desejado = estadoDesejado(pessoas);
    for (const p of pessoas) for (const x of p.permissoes) {
      if (cfg.gerenciados.includes(x.ambiente) || !p.ativo) continue;
      const msg = `o sincronizador ainda não gerencia o ${x.ambiente}`;
      if (x.hub) status.push([p.id, 'HUB', x.ambiente, 'ignorado', msg]);
      if (x.banco !== 'nenhum' && p.perfil === 'desenvolvedor') status.push([p.id, 'Banco', x.ambiente, 'ignorado', msg]);
    }

    // HUB
    for (const d of desejado) if (d.hub.includes(cfg.central)) status.push([d.u.id, 'HUB', cfg.central, 'aplicado', 'painel central']);
    for (const a of outros) {
      const r = conexoes.find((x) => x.amb === a);
      if (r?.temHub) await replicarHub(r, desejado, status);
      else for (const d of desejado.filter((d) => d.hub.includes(a)))
        status.push([d.u.id, 'HUB', a, 'ignorado', `o HUB ainda não foi publicado no ${a}`]);
    }

    // Banco
    for (const r of conexoes) {
      try { await sincronizarBanco(r, desejado, status); } catch (e) { erros.push(`Banco ${r.amb}: ${e.message}`); }
    }
    for (const d of desejado) for (const a of Object.keys(d.banco))
      if (!conexoes.some((r) => r.amb === a)) status.push([d.u.id, 'Banco', a, 'erro', `banco do ${a} indisponível`]);

    // Servidor
    try { sincronizarServidor(desejado, status); } catch (e) { erros.push(`Servidor: ${e.message}`); }

    // GitHub
    const comGithub = desejado.filter((d) => d.github);
    if (!cfg.github) {
      for (const d of comGithub) status.push([d.u.id, 'GitHub', '-', 'ignorado', 'GitHub App ainda não configurado']);
    } else {
      try {
        const r = await sincronizarGithub(cfg.github, new Map(comGithub.map((d) => [d.u.id, d.github])));
        for (const [id, s] of r) status.push([id, 'GitHub', '-', s.estado, s.mensagem]);
      } catch (e) {
        erros.push(`GitHub: ${e.message}`);
        for (const d of comGithub) status.push([d.u.id, 'GitHub', '-', 'erro', e.message]);
      }
    }

    // grava o status (substitui tudo: o que não foi reportado não está mais aplicado)
    await central.c.query('BEGIN');
    await central.c.query('DELETE FROM hub.sincronizacao_status');
    for (const s of status) {
      await central.c.query(
        `INSERT INTO hub.sincronizacao_status (usuario_id, sistema, ambiente, estado, mensagem) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (usuario_id, sistema, ambiente) DO UPDATE SET estado = $4, mensagem = $5, atualizado_em = now()`, s);
    }
    await central.c.query('COMMIT');
  } catch (e) {
    erros.push(e.message);
  } finally {
    const resumo = {
      aplicados: status.filter((s) => s[3] === 'aplicado').length,
      erros: status.filter((s) => s[3] === 'erro').length + erros.length,
      falhas_gerais: erros,
    };
    await central.c.query(
      `UPDATE hub.sincronizacao_execucoes SET concluida_em = now(), resultado = $2, resumo = $3 WHERE id = $1`,
      [execId, erros.length ? 'erro' : 'ok', JSON.stringify(resumo)]);
    // pedidos que chegaram durante a execução já foram atendidos por ela
    await central.c.query(
      `UPDATE hub.sincronizacao_execucoes SET iniciada_em = now(), concluida_em = now(), resultado = 'ok',
         resumo = jsonb_build_object('atendido_por', $1::bigint) WHERE concluida_em IS NULL`, [execId]);
    log(`concluída: ${JSON.stringify(resumo)}`);
    for (const r of conexoes) await r.c.end().catch(() => {});
  }
}

main().catch((e) => {
  log('ERRO:', e.message);
  process.exit(1);
});
