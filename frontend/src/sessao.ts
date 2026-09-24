import { reactive } from 'vue';
import { api, ErroApi, Permissao } from './api';

interface Eu {
  id: string; nome: string; email: string; papel: string; admin_sistema: boolean;
  github_usuario: string | null; github_permissao: string; usuario_servidor: string | null;
  permissoes: Permissao[];
}

export const sessao = reactive<{ eu: Eu | null; carregada: boolean; ambiente: string }>({
  eu: null,
  carregada: false,
  ambiente: '',
});

export async function carregarSessao() {
  try {
    sessao.eu = await api<Eu>('/auth/eu');
  } catch (e) {
    if (!(e instanceof ErroApi && e.status === 401)) throw e;
    sessao.eu = null;
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
