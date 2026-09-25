export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}

export async function api<T = any>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api${caminho}`, {
    method: opcoes.metodo ?? (opcoes.corpo ? 'POST' : 'GET'),
    headers: opcoes.corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    credentials: 'same-origin',
  });
  const dados = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (!r.ok) {
    const msg = Array.isArray(dados?.message) ? dados.message.join('; ') : dados?.message;
    throw new ErroApi(r.status, msg ?? `Erro ${r.status}`);
  }
  return dados as T;
}

export const AMBIENTES = ['dev', 'hml', 'prod'] as const;

export const PAPEIS: Record<string, string> = {
  aluno: 'Aluno',
  preceptor: 'Preceptor',
  tutor: 'Tutor',
  coordenador: 'Coordenador',
  coordenacao_geral: 'Coordenação geral',
  externo: 'Externo',
};

export const NOME_AMBIENTE: Record<string, string> = {
  dev: 'Desenvolvimento',
  hml: 'Homologação',
  prod: 'Produção',
};

export const PERFIS: Record<string, string> = {
  desenvolvedor: 'Desenvolvedor (Grupo II)',
  usuario: 'Usuário do sistema',
};

export const GRUPOS: Record<number, string> = { 1: 'PET I', 2: 'PET II', 3: 'PET III', 4: 'PET IV', 5: 'PET V' };

export interface Permissao { ambiente: string; hub: boolean; banco: 'nenhum' | 'leitura' | 'escrita'; servidor: boolean }
export interface Pessoa {
  id: string; nome: string; email: string; papel: string; perfil: 'desenvolvedor' | 'usuario'; grupo: number | null;
  admin_sistema: boolean; ativo: boolean;
  github_usuario: string | null; github_permissao: string;
  usuario_servidor: string | null; chave_ssh: string | null;
  ultimo_login: string | null; permissoes: Permissao[];
}
