import { reactive } from 'vue';
import { api, Permissao } from './api';

/** Informações do painel de administração deste ambiente (central ou gerenciado). */
export const painel = reactive<{ carregado: boolean; modo: 'central' | 'gerenciado'; ambiente: string; padroes: Record<string, Permissao[]> }>({
  carregado: false,
  modo: 'central',
  ambiente: '',
  padroes: {},
});

export async function carregarPainel() {
  if (painel.carregado) return;
  Object.assign(painel, await api('/admin/painel'), { carregado: true });
}
