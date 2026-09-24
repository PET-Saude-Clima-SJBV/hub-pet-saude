function obrigatorio(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ${nome} não definida`);
  return v;
}

export const config = {
  ambiente: (process.env.AMBIENTE ?? 'local') as 'local' | 'dev' | 'hml' | 'prod',
  porta: Number(process.env.PORT ?? 3000),
  databaseUrl: obrigatorio('DATABASE_URL'),
  jwtSegredo: obrigatorio('JWT_SEGREDO'),
  admin: {
    email: process.env.ADMIN_EMAIL,
    nome: process.env.ADMIN_NOME ?? 'Administrador',
    senhaInicial: process.env.ADMIN_SENHA_INICIAL,
  },
  // true só quando o site for servido por HTTPS
  cookieSeguro: process.env.COOKIE_SEGURO === 'true',
};

export const COOKIE_SESSAO = `hub_sessao_${config.ambiente}`;
