import { reactive } from 'vue';
import { api } from './api';

/** Itens ativos dos cadastros (tipos de atividade, territórios, instituições...), carregados uma vez. */
export interface ItemCatalogo { codigo: string; nome: string; sigla: string | null; pai: string | null }

export const catalogos = reactive<{ carregado: boolean; itens: Record<string, ItemCatalogo[]> }>({ carregado: false, itens: {} });

/** Grupos PET (número -> nome). Começa com os 5 do edital e é atualizado pelo cadastro. */
export const GRUPOS = reactive<Record<number, string>>({ 1: 'PET I', 2: 'PET II', 3: 'PET III', 4: 'PET IV', 5: 'PET V' });

let carregando: Promise<void> | null = null;
export function carregarCatalogos(forcar = false) {
  if (forcar) carregando = null;
  return (carregando ??= api<Record<string, ItemCatalogo[]>>('/catalogos').then((r) => {
    catalogos.itens = r;
    catalogos.carregado = true;
    if (r.grupos?.length) {
      for (const k of Object.keys(GRUPOS)) delete GRUPOS[Number(k)];
      for (const g of r.grupos) GRUPOS[Number(g.codigo)] = g.nome;
    }
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
