import { Injectable } from '@nestjs/common';
import { ClienteIntegracao, IntegracoesService } from '../integracoes';

/** Código IBGE de São João da Boa Vista / SP */
export const IBGE_SJBV = '3549102';
const URL = 'https://apiprevmet3.inmet.gov.br/avisos/ativos';

export type SeveridadeInmet = 'Perigo Potencial' | 'Perigo' | 'Grande Perigo';

export interface AvisoOficial {
  id: number;
  evento: string;            // ex.: "Onda de Calor"
  severidade: SeveridadeInmet;
  cor: string;               // cor oficial do INMET (amarelo, laranja, vermelho)
  inicio: string;            // "AAAA-MM-DD HH:MM" (horário de Brasília)
  fim: string;
  vigente: boolean;          // já começou e ainda não terminou
  riscos: string[];
  instrucoes: string[];
  fonte: 'INMET';
}

interface AvisoBruto {
  id: number; descricao: string; severidade: SeveridadeInmet; aviso_cor: string; inicio: string; fim: string;
  geocodes: string; encerrado: boolean; riscos: string | string[]; instrucoes: string | string[];
}

/** O INMET manda texto ou lista de textos; vira uma lista de frases curtas. */
function frases(v: string | string[] | null | undefined) {
  return (Array.isArray(v) ? v : [v ?? ''])
    .flatMap((t) => String(t).split(/\.\s+|;\s*/))
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s.length > 3);
}

const ORDEM: SeveridadeInmet[] = ['Perigo Potencial', 'Perigo', 'Grande Perigo'];
export const ordemSeveridade = (s: SeveridadeInmet) => ORDEM.indexOf(s);

/** "AAAA-MM-DD HH:MM" no horário de Brasília (o INMET publica assim) */
function agoraBrasilia() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16);
}

/**
 * Avisos meteorológicos OFICIAIS do INMET (Instituto Nacional de Meteorologia) para o município.
 * Dado público, sem cadastro; reprodução permitida citando a fonte.
 */
@Injectable()
export class AvisosInmetService {
  private cliente: ClienteIntegracao;

  constructor(integracoes: IntegracoesService) {
    this.cliente = integracoes.cliente('inmet-avisos', {
      descricao: 'Avisos meteorológicos oficiais do INMET para São João da Boa Vista',
      tipo: 'externa',
      destino: 'apiprevmet3.inmet.gov.br',
      timeoutMs: 8000,
      tentativas: 2,
      cacheSegundos: 600,
    });
  }

  async doMunicipio(ibge = IBGE_SJBV): Promise<AvisoOficial[]> {
    const r = await this.cliente.buscar<{ hoje?: AvisoBruto[]; futuro?: AvisoBruto[] }>(URL);
    const agora = agoraBrasilia();
    const vistos = new Set<number>();
    return [...(r.hoje ?? []), ...(r.futuro ?? [])]
      .filter((a) => !a.encerrado && a.fim >= agora && String(a.geocodes).split(',').includes(ibge))
      .filter((a) => !vistos.has(a.id) && vistos.add(a.id))
      .map((a) => ({
        id: a.id,
        evento: a.descricao,
        severidade: a.severidade,
        cor: a.aviso_cor,
        inicio: a.inicio,
        fim: a.fim,
        vigente: a.inicio <= agora,
        riscos: frases(a.riscos),
        instrucoes: frases(a.instrucoes),
        fonte: 'INMET' as const,
      }))
      .sort((x, y) => Number(y.vigente) - Number(x.vigente) || ordemSeveridade(y.severidade) - ordemSeveridade(x.severidade));
  }
}
