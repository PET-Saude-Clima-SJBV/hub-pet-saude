import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ClienteIntegracao, IntegracoesService } from '../integracoes';
import { AvisoOficial, AvisosInmetService } from '../inmet/avisos';

/** São João da Boa Vista / SP */
const LOCAL = { nome: 'São João da Boa Vista', latitude: -21.9692, longitude: -46.7983 };

const URL = 'https://api.open-meteo.com/v1/forecast'
  + `?latitude=${LOCAL.latitude}&longitude=${LOCAL.longitude}`
  + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day'
  + '&hourly=temperature_2m,precipitation_probability,weather_code,is_day'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,uv_index_max'
  + '&timezone=America%2FSao_Paulo&forecast_days=5';

// códigos WMO usados pela Open-Meteo
const CONDICOES: [number[], string, string][] = [
  [[0], 'Céu limpo', '☀️'], [[1], 'Poucas nuvens', '🌤️'], [[2], 'Parcialmente nublado', '⛅'], [[3], 'Nublado', '☁️'],
  [[45, 48], 'Neblina', '🌫️'], [[51, 53, 55, 56, 57], 'Garoa', '🌦️'], [[61, 63, 66, 80, 81], 'Chuva', '🌧️'],
  [[65, 67, 82], 'Chuva forte', '🌧️'], [[71, 73, 75, 77, 85, 86], 'Neve', '❄️'], [[95, 96, 99], 'Tempestade', '⛈️'],
];
function condicao(codigo: number, dia = true) {
  const [, descricao, icone] = CONDICOES.find(([c]) => c.includes(codigo)) ?? [[], 'Tempo', '🌡️'];
  return { descricao, icone: !dia && codigo <= 1 ? '🌙' : icone };
}

export type Nivel = 'tranquilo' | 'atencao' | 'alerta';
export interface Orientacao { nivel: Nivel; titulo: string; texto: string }
const ORDEM: Nivel[] = ['tranquilo', 'atencao', 'alerta'];
const maior = (a: Nivel, b: Nivel) => (ORDEM.indexOf(b) > ORDEM.indexOf(a) ? b : a);

interface RespostaOpenMeteo {
  current: {
    time: string; temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number;
    precipitation: number; weather_code: number; wind_speed_10m: number; is_day: number;
  };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[]; is_day: number[] };
  daily: {
    time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[];
    precipitation_sum: number[]; precipitation_probability_max: number[]; uv_index_max: number[];
  };
}

/**
 * Orientação a partir das medições do momento e da previsão do dia.
 * Umidade: faixas da Defesa Civil (30% atenção, 20% alerta). Calor: sensação térmica.
 * Complementa, e nunca substitui, os avisos oficiais do INMET e da Defesa Civil.
 */
export function orientar(c: Pick<RespostaOpenMeteo['current'], 'relative_humidity_2m' | 'apparent_temperature' | 'precipitation' | 'weather_code'>,
  d: Pick<RespostaOpenMeteo['daily'], 'temperature_2m_max' | 'precipitation_sum' | 'uv_index_max'>): Orientacao[] {
  const o: Orientacao[] = [];
  const umidade = c.relative_humidity_2m;
  if (umidade < 20) o.push({ nivel: 'alerta', titulo: `Umidade do ar em ${umidade}%: alerta`,
    texto: 'Evite exercícios ao ar livre das 10h às 16h. Beba água ao longo do dia. Umidifique o ambiente onde dorme.' });
  else if (umidade < 30) o.push({ nivel: 'atencao', titulo: `Umidade do ar em ${umidade}%: atenção`,
    texto: 'Beba água ao longo do dia. Evite exercícios intensos das 10h às 16h.' });

  const sensacao = Math.round(Math.max(c.apparent_temperature, d.temperature_2m_max[0] ?? -99));
  if (sensacao >= 40) o.push({ nivel: 'alerta', titulo: `Calor extremo: até ${sensacao}°C`,
    texto: 'Fique na sombra ou em local ventilado. Beba água mesmo sem sede. Cuide de crianças, idosos e pessoas com doenças crônicas.' });
  else if (sensacao >= 35) o.push({ nivel: 'atencao', titulo: `Calor intenso: até ${sensacao}°C`,
    texto: 'Use roupas leves e protetor solar. Evite o sol das 10h às 16h.' });

  if (c.precipitation >= 10 || [65, 67, 82, 95, 96, 99].includes(c.weather_code)) o.push({ nivel: 'alerta', titulo: 'Chuva forte agora',
    texto: 'Não atravesse ruas ou áreas alagadas. Fique longe de córregos e encostas.' });
  else if ((d.precipitation_sum[0] ?? 0) >= 30) o.push({ nivel: 'atencao', titulo: `Chuva forte prevista para hoje (${Math.round(d.precipitation_sum[0])} mm)`,
    texto: 'Evite locais que costumam alagar. Adie deslocamentos durante as pancadas.' });

  const uv = Math.round(d.uv_index_max[0] ?? 0);
  if (uv >= 11) o.push({ nivel: 'atencao', titulo: `Índice UV extremo hoje (${uv})`,
    texto: 'Evite o sol das 10h às 16h. Use chapéu, óculos escuros e protetor solar.' });
  return o;
}

/** O que fazer em cada tipo de evento dos avisos oficiais (o INMET traz poucas instruções). */
const O_QUE_FAZER: [RegExp, string][] = [
  [/calor/i, 'Beba água mesmo sem sede. Evite o sol das 10h às 16h. Fique em local fresco e ventilado. Cuide de crianças, idosos, gestantes e pessoas com doenças crônicas. Procure a UBS se tiver tontura, dor de cabeça forte ou confusão.'],
  [/umidade/i, 'Beba água ao longo do dia. Evite exercícios ao ar livre das 10h às 16h. Umidifique o ambiente onde dorme.'],
  [/chuva|tempestade/i, 'Não atravesse ruas ou áreas alagadas. Fique longe de córregos, encostas e árvores. Desligue aparelhos elétricos se a água entrar em casa.'],
  [/vendaval|vento/i, 'Não se abrigue sob árvores ou placas. Recolha objetos soltos em quintais e varandas.'],
  [/geada|frio/i, 'Agasalhe crianças e idosos. Não use braseiro ou fogareiro em ambiente fechado.'],
];
export const oQueFazer = (evento: string) => O_QUE_FAZER.find(([re]) => re.test(evento))?.[1] ?? null;

function nivelDoAviso(a: AvisoOficial): Nivel {
  if (!a.vigente) return 'atencao';             // aviso futuro: prepare-se
  return a.severidade === 'Perigo Potencial' ? 'atencao' : 'alerta';
}

@Injectable()
export class ClimaService {
  private cliente: ClienteIntegracao;

  constructor(integracoes: IntegracoesService, private avisos: AvisosInmetService) {
    this.cliente = integracoes.cliente('open-meteo', {
      descricao: 'Medições e previsão do tempo para São João da Boa Vista (página pública)',
      tipo: 'externa',
      destino: 'api.open-meteo.com',
      timeoutMs: 4000,
      tentativas: 2,
      cacheSegundos: 600,
    });
  }

  async agora() {
    const [clima, oficiais] = await Promise.allSettled([
      this.cliente.buscar<RespostaOpenMeteo>(URL),
      this.avisos.doMunicipio(),
    ]);
    if (clima.status === 'rejected') throw new ServiceUnavailableException('Dados do clima indisponíveis no momento');
    const r = clima.value;
    const c = r.current;
    const avisos = (oficiais.status === 'fulfilled' ? oficiais.value : []).map((a) => ({ ...a, o_que_fazer: oQueFazer(a.evento) }));

    const orientacoes = orientar(c, r.daily);
    let nivel = orientacoes.reduce<Nivel>((n, x) => maior(n, x.nivel), 'tranquilo');
    for (const a of avisos) nivel = maior(nivel, nivelDoAviso(a));
    // "sem risco" só quando não há nada oficial e a consulta ao INMET funcionou
    if (!orientacoes.length && !avisos.length && oficiais.status === 'fulfilled') {
      orientacoes.push({ nivel: 'tranquilo', titulo: 'Sem risco climático agora', texto: 'Condições normais para atividades ao ar livre.' });
    }

    // próximas 12 horas a partir da hora atual
    const inicio = Math.max(0, r.hourly.time.findIndex((t) => t >= c.time.slice(0, 13)));
    const horas = r.hourly.time.slice(inicio + 1, inicio + 13).map((t, i) => ({
      hora: t.slice(11, 16),
      temperatura: r.hourly.temperature_2m[inicio + 1 + i],
      chance_chuva: r.hourly.precipitation_probability[inicio + 1 + i],
      ...condicao(r.hourly.weather_code[inicio + 1 + i], !!r.hourly.is_day[inicio + 1 + i]),
    }));
    const dias = r.daily.time.map((d, i) => ({
      data: d,
      maxima: r.daily.temperature_2m_max[i], minima: r.daily.temperature_2m_min[i],
      chuva_mm: r.daily.precipitation_sum[i], chance_chuva: r.daily.precipitation_probability_max[i],
      uv_max: r.daily.uv_index_max[i], ...condicao(r.daily.weather_code[i]),
    }));

    return {
      local: LOCAL.nome,
      medido_em: c.time,
      condicao: condicao(c.weather_code, !!c.is_day),
      temperatura: c.temperature_2m,
      sensacao: c.apparent_temperature,
      umidade: c.relative_humidity_2m,
      vento_kmh: c.wind_speed_10m,
      chuva_mm: c.precipitation,
      hoje: dias[0],
      horas,
      dias,
      nivel,
      avisos_oficiais: avisos,
      avisos_indisponiveis: oficiais.status === 'rejected',
      orientacoes,
      fontes: ['INMET (avisos oficiais)', 'Open-Meteo (medições e previsão)'],
    };
  }
}
