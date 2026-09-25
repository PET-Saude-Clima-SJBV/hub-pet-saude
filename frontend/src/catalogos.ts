import { reactive } from 'vue';
import { api } from './api';

/** Itens ativos dos cadastros (tipos de atividade, territórios, instituições...), carregados uma vez. */
export interface ItemCatalogo { codigo: string; nome: string; sigla: string | null; pai: string | null }

export const catalogos = reactive<{ carregado: boolean; itens: Record<string, ItemCatalogo[]> }>({ carregado: false, itens: {} });

let carregando: Promise<void> | null = null;
export function carregarCatalogos(forcar = false) {
  if (forcar) carregando = null;
  return (carregando ??= api<Record<string, ItemCatalogo[]>>('/catalogos').then((r) => {
    catalogos.itens = r;
    catalogos.carregado = true;
  }));
}

export const itens = (catalogo: string, pai?: string | null) =>
  (catalogos.itens[catalogo] ?? []).filter((i) => pai === undefined || !pai || !i.pai || i.pai === pai);

/** Nome para exibir; se o item foi inativado, mostra o próprio código. */
export const nomeDe = (catalogo: string, codigo: string | null | undefined, curto = false) => {
  if (!codigo) return '';
  const i = (catalogos.itens[catalogo] ?? []).find((x) => x.codigo === codigo);
  return i ? (curto && i.sigla ? i.sigla : i.nome) : codigo;
};
