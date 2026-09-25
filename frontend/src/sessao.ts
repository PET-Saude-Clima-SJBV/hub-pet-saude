import { reactive } from 'vue';
import { api, ErroApi, Permissao } from './api';

interface Eu {
  id: string; nome: string; email: string; papel: string; grupo: number | null; admin_sistema: boolean;
  github_usuario: string | null; github_permissao: string; usuario_servidor: string | null;
  permissoes: Permissao[];
}

export type Escopo = 'nenhum' | 'proprio' | 'grupo' | 'todos';

export const sessao = reactive<{ eu: Eu | null; carregada: boolean; ambiente: string; pode: Record<string, Escopo> }>({
  eu: null,
  carregada: false,
  ambiente: '',
  pode: {},
});

/** A pessoa tem a capacidade em algum escopo além de "nenhum"? */
export const tem = (capacidade: string) => (sessao.pode[capacidade] ?? 'nenhum') !== 'nenhum';

export async function carregarSessao() {
  try {
    sessao.eu = await api<Eu>('/auth/eu');
    sessao.pode = await api<Record<string, Escopo>>('/permissoes/minhas');
  } catch (e) {
    if (!(e instanceof ErroApi && e.status === 401)) throw e;
    sessao.eu = null;
    sessao.pode = {};
  }
  sessao.carregada = true;
}

export async function entrar(email: string, senha: string) {
  await api('/auth/login', { corpo: { email, senha } });
  await carregarSessao();
}

export async function sair() {
  await api('/auth/logout', { metodo: 'POST' });
  sessao.eu = null;
}
