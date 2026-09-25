import { BadRequestException } from '@nestjs/common';
import { CatalogosService } from '../catalogos/catalogos';

/**
 * Ficha do indicador: os mesmos campos da aba "Indicadores" da planilha da coordenação.
 * Usada pelo formulário da meta e pela importação de arquivo.
 */
export const CAMPOS_TEXTO: Record<string, number> = {
  o_que_mede: 500, formula_numerador: 1000, formula_denominador: 1000, unidade: 60,
  fonte: 300, fonte_denominador: 300, linha_base: 60, linha_base_data: 30, linha_base_fonte: 300,
  valor_alvo: 60, prazo_alvo: 60, responsavel: 200, responsavel_validacao: 200, observacoes: 2000,
};
/** Campos com lista (cadastro) */
export const CAMPOS_CADASTRO: Record<string, [string, string]> = {
  periodicidade: ['periodicidades', 'a periodicidade'],
  desagregacao: ['desagregacoes', 'a desagregação'],
  tipo: ['tipos_indicador', 'o tipo do indicador'],
};
export const COLUNAS_FICHA = [...Object.keys(CAMPOS_TEXTO), ...Object.keys(CAMPOS_CADASTRO)];

/** O Guia pede estes campos preenchidos ANTES da coleta começar. */
export const CAMPOS_OBRIGATORIOS_GUIA = ['formula_numerador', 'linha_base', 'fonte', 'periodicidade', 'responsavel'];
export const fichaPreenchida = (i: any) => CAMPOS_OBRIGATORIOS_GUIA.filter((c) => i[c] !== null && i[c] !== undefined && i[c] !== '').length;

function texto(v: unknown, max: number, campo: string): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s.length > max) throw new BadRequestException(`${campo}: texto maior que ${max} caracteres`);
  return s || null;
}

/** Valida e normaliza os campos da ficha. Cadastros aceitam o código ou o nome ("Trimestral"). */
export async function lerFicha(d: any, cat: CatalogosService, porNome?: (catalogo: string, v: string) => string | null) {
  const r: Record<string, string | null> = {};
  for (const [campo, max] of Object.entries(CAMPOS_TEXTO)) r[campo] = texto(d[campo], max, campo);
  for (const [campo, [catalogo, rotulo]] of Object.entries(CAMPOS_CADASTRO)) {
    let v = d[campo] === undefined || d[campo] === null ? '' : String(d[campo]).trim();
    if (v && porNome) v = porNome(catalogo, v) ?? v;
    r[campo] = await cat.exigir(catalogo, v, rotulo, true);
  }
  return r;
}
