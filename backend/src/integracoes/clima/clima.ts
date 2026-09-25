import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ClienteIntegracao, IntegracoesService } from '../integracoes';

/** São João da Boa Vista / SP */
const LOCAL = { nome: 'São João da Boa Vista', latitude: -21.9692, longitude: -46.7983 };

const URL = 'https://api.open-meteo.com/v1/forecast'
  + `?latitude=${LOCAL.latitude}&longitude=${LOCAL.longitude}`
  + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day'
  + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max'
  + '&timezone=America%2FSao_Paulo&forecast_days=1';

// códigos WMO usados pela Open-Meteo
const CONDICOES: [number[], string, string][] = [
  [[0], 'Céu limpo', '☀️'], [[1], 'Poucas nuvens', '🌤️'], [[2], 'Parcialmente nublado', '⛅'], [[3], 'Nublado', '☁️'],
  [[45, 48], 'Neblina', '🌫️'], [[51, 53, 55, 56, 57], 'Garoa', '🌦️'], [[61, 63, 66, 80, 81], 'Chuva', '🌧️'],
  [[65, 67, 82], 'Chuva forte', '🌧️'], [[71, 73, 75, 77, 85, 86], 'Neve', '❄️'], [[95, 96, 99], 'Tempestade', '⛈️'],
];

export type Nivel = 'tranquilo' | 'atencao' | 'alerta';
export interface Orientacao { nivel: Nivel; titulo: string; texto: string }

interface RespostaOpenMeteo {
  current: {
    time: string; temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number;
    precipitation: number; weather_code: number; wind_speed_10m: number; is_day: number;
  };
  daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; uv_index_max: number[] };
}

/**
 * Orientação à população a partir dos dados do momento. Faixas de umidade seguem a classificação
 * usada pela Defesa Civil (30% atenção, 20% alerta, 12% emergência); calor pela sensação térmica.
 * É ORIENTATIVO: não substitui os alertas oficiais da Defesa Civil.
 */
export function orientar(c: RespostaOpenMeteo['current'], d: RespostaOpenMeteo['daily']): Orientacao[] {
  const o: Orientacao[] = [];
  const umidade = c.relative_humidity_2m;
  if (umidade < 20) o.push({ nivel: 'alerta', titulo: `Umidade do ar muito baixa (${umidade}%)`,
    texto: 'Evite atividade física ao ar livre entre 10h e 16h, beba água com frequência e umidifique os ambientes.' });
  else if (umidade < 30) o.push({ nivel: 'atencao', titulo: `Umidade do ar baixa (${umidade}%)`,
    texto: 'Beba bastante água e evite exercícios intensos nos horários mais quentes.' });

  const sensacao = Math.max(c.apparent_temperature, d.temperature_2m_max[0] ?? -99);
  if (sensacao >= 40) o.push({ nivel: 'alerta', titulo: `Calor extremo (sensação de ${Math.round(sensacao)}°C)`,
    texto: 'Fique em locais frescos, hidrate-se, e atenção redobrada com crianças, idosos e pessoas com doenças crônicas.' });
  else if (sensacao >= 35) o.push({ nivel: 'atencao', titulo: `Calor intenso (até ${Math.round(sensacao)}°C)`,
    texto: 'Use roupas leves, protetor solar e prefira a sombra entre 10h e 16h.' });

  if (c.precipitation >= 10 || [65, 67, 82, 95, 96, 99].includes(c.weather_code)) o.push({ nivel: 'alerta', titulo: 'Chuva forte agora',
    texto: 'Evite áreas alagadas e margens de córregos. Em emergência, ligue 199 (Defesa Civil) ou 193 (Bombeiros).' });
  else if ((d.precipitation_sum[0] ?? 0) >= 30) o.push({ nivel: 'atencao', titulo: 'Previsão de muita chuva hoje',
    texto: 'Fique atento a alagamentos e evite deslocamentos desnecessários durante as pancadas.' });

  const uv = d.uv_index_max[0] ?? 0;
  if (uv >= 11) o.push({ nivel: 'atencao', titulo: `Índice UV extremo (${Math.round(uv)})`,
    texto: 'Evite o sol entre 10h e 16h; use chapéu, óculos e protetor solar.' });

  if (!o.length) o.push({ nivel: 'tranquilo', titulo: 'Condições tranquilas agora',
    texto: 'Não há sinal de risco climático neste momento. Mantenha a hidratação e bons hábitos.' });
  return o;
}

@Injectable()
export class ClimaService {
  private cliente: ClienteIntegracao;

  constructor(integracoes: IntegracoesService) {
    this.cliente = integracoes.cliente('open-meteo', {
      descricao: 'Clima do momento em São João da Boa Vista (página pública)',
      tipo: 'externa',
      destino: 'api.open-meteo.com',
      timeoutMs: 4000,
      tentativas: 2,
      cacheSegundos: 600, // 10 min: dado de clima não muda a cada segundo e poupamos o serviço
    });
  }

  async agora() {
    let r: RespostaOpenMeteo;
    try {
      r = await this.cliente.buscar<RespostaOpenMeteo>(URL);
    } catch {
      throw new ServiceUnavailableException('Dados do clima indisponíveis no momento');
    }
    const c = r.current;
    const [, descricao, icone] = CONDICOES.find(([cods]) => cods.includes(c.weather_code)) ?? [[], 'Tempo', '🌡️'];
    const orientacoes = orientar(c, r.daily);
    const ordem: Nivel[] = ['tranquilo', 'atencao', 'alerta'];
    return {
      local: LOCAL.nome,
      medido_em: c.time,
      condicao: { descricao, icone: c.is_day ? icone : (c.weather_code === 0 ? '🌙' : icone) },
      temperatura: c.temperature_2m,
      sensacao: c.apparent_temperature,
      umidade: c.relative_humidity_2m,
      vento_kmh: c.wind_speed_10m,
      chuva_mm: c.precipitation,
      hoje: { maxima: r.daily.temperature_2m_max[0], minima: r.daily.temperature_2m_min[0], chuva_mm: r.daily.precipitation_sum[0], uv_max: r.daily.uv_index_max[0] },
      nivel: orientacoes.reduce<Nivel>((n, x) => (ordem.indexOf(x.nivel) > ordem.indexOf(n) ? x.nivel : n), 'tranquilo'),
      orientacoes,
      fonte: 'Open-Meteo',
    };
  }
}
