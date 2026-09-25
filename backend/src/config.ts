function obrigatorio(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ${nome} não definida`);
  return v;
}

const AMBIENTE = process.env.AMBIENTE ?? 'local';
if (!['local', 'dev', 'hml', 'prod'].includes(AMBIENTE)) throw new Error(`AMBIENTE inválido: ${AMBIENTE}`);

export const config = {
  ambiente: AMBIENTE as 'local' | 'dev' | 'hml' | 'prod',
  porta: Number(process.env.PORT ?? 3000),
  databaseUrl: obrigatorio('DATABASE_URL'),
  jwtSegredo: obrigatorio('JWT_SEGREDO'),
  admin: {
    email: process.env.ADMIN_EMAIL,
    nome: process.env.ADMIN_NOME ?? 'Administrador',
    senhaInicial: process.env.ADMIN_SENHA_INICIAL,
  },
  // central: este ambiente é onde o administrador cadastra pessoas e acessos.
  // gerenciado: as pessoas vêm do painel central (via sincronizador); a administração é só leitura.
  painelModo: (process.env.PAINEL_MODO ?? 'central') as 'central' | 'gerenciado',
  // true só quando o site for servido por HTTPS
  cookieSeguro: process.env.COOKIE_SEGURO === 'true',
};

export const COOKIE_SESSAO = `hub_sessao_${config.ambiente}`;
