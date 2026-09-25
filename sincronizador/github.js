// Integração com o GitHub por um GitHub App instalado na organização.
// Permissões do App: Organization > Members (read & write), Repository > Administration (read & write).
const { createSign } = require('crypto');
const { readFileSync } = require('fs');

const API = 'https://api.github.com';

function jwtDoApp(appId, chavePem) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat: agora - 60, exp: agora + 540, iss: String(appId) })}`;
  const assinatura = createSign('RSA-SHA256').update(corpo).sign(chavePem, 'base64url');
  return `${corpo}.${assinatura}`;
}

async function chamar(token, metodo, caminho, corpo) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hub-sincronizador',
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 404 && metodo === 'GET') return null;
  if (!r.ok) throw new Error(`GitHub ${metodo} ${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

async function conectar({ appId, chaveArquivo, org }) {
  const jwt = jwtDoApp(appId, readFileSync(chaveArquivo, 'utf8'));
  const inst = await chamar(jwt, 'GET', `/orgs/${org}/installation`);
  if (!inst) throw new Error(`GitHub App não está instalado na organização ${org}`);
  const { token } = await chamar(jwt, 'POST', `/app/installations/${inst.id}/access_tokens`);
  return (metodo, caminho, corpo) => chamar(token, metodo, caminho, corpo);
}

const PERMISSAO_REPO = { 'hub-leitura': 'pull', 'hub-desenvolvimento': 'push', 'hub-administradores': 'admin' };

/**
 * desejado: Map<usuarioId, { login, time }>. Retorna Map<usuarioId, {estado, mensagem}>.
 * Só mexe nos três times do HUB; nunca remove ninguém da organização.
 */
async function sincronizarGithub(cfg, desejado) {
  const gh = await conectar(cfg);
  const resultado = new Map();

  for (const [slug, permissao] of Object.entries(PERMISSAO_REPO)) {
    if (!(await gh('GET', `/orgs/${cfg.org}/teams/${slug}`))) {
      await gh('POST', `/orgs/${cfg.org}/teams`, { name: slug, privacy: 'closed', description: 'Gerenciado pelo painel do HUB' });
    }
    await gh('PUT', `/orgs/${cfg.org}/teams/${slug}/repos/${cfg.org}/${cfg.repo}`, { permission: permissao });
  }

  // quem deveria estar em cada time
  const porTime = {};
  for (const slug of Object.keys(PERMISSAO_REPO)) porTime[slug] = new Set();
  for (const d of desejado.values()) porTime[d.time].add(d.login.toLowerCase());

  // tira de cada time quem não deveria estar (membros e convites pendentes)
  for (const slug of Object.keys(PERMISSAO_REPO)) {
    const membros = (await gh('GET', `/orgs/${cfg.org}/teams/${slug}/members?per_page=100`)) ?? [];
    for (const m of membros) {
      if (!porTime[slug].has(m.login.toLowerCase())) {
        await gh('DELETE', `/orgs/${cfg.org}/teams/${slug}/memberships/${m.login}`);
      }
    }
  }

  // coloca cada pessoa no seu time (convida para a organização se ainda não for membro)
  for (const [id, d] of desejado) {
    try {
      const r = await gh('PUT', `/orgs/${cfg.org}/teams/${d.time}/memberships/${d.login}`, { role: 'member' });
      resultado.set(id, r.state === 'pending'
        ? { estado: 'aplicado', mensagem: 'convite enviado, aguardando a pessoa aceitar' }
        : { estado: 'aplicado', mensagem: null });
    } catch (e) {
      resultado.set(id, { estado: 'erro', mensagem: e.message });
    }
  }
  return resultado;
}

module.exports = { sincronizarGithub };
