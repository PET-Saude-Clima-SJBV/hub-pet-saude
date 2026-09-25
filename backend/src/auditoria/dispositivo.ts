/**
 * De qual dispositivo veio a requisição, a partir do que o navegador informa (User-Agent e,
 * quando existe, o cabeçalho Sec-CH-UA-Mobile). É um indício para auditoria, não uma prova:
 * o navegador pode ser configurado para se identificar como outro.
 * Não guardamos IP nem nada que identifique o aparelho em si.
 */
export type TipoDispositivo = 'celular' | 'tablet' | 'computador' | 'desconhecido';

export interface Dispositivo { tipo: TipoDispositivo; detalhe: string | null; userAgent: string | null }

export function identificarDispositivo(cabecalhos: Record<string, string | string[] | undefined>): Dispositivo {
  const ua = String(cabecalhos['user-agent'] ?? '').slice(0, 400);
  if (!ua) return { tipo: 'desconhecido', detalhe: null, userAgent: null };
  const dica = String(cabecalhos['sec-ch-ua-mobile'] ?? '');

  let tipo: TipoDispositivo;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) tipo = 'tablet';
  else if (dica === '?1' || /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) tipo = 'celular';
  else if (/Windows NT|Macintosh|X11|Linux x86_64|CrOS/i.test(ua)) tipo = 'computador';
  else tipo = 'desconhecido';

  const so = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Windows NT/i.test(ua) ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
          : /CrOS/i.test(ua) ? 'ChromeOS'
            : /Linux/i.test(ua) ? 'Linux' : null;
  const navegador = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
      : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
        : /Firefox\//i.test(ua) ? 'Firefox'
          : /Chrome\//i.test(ua) ? 'Chrome'
            : /Safari\//i.test(ua) ? 'Safari'
              : /curl|node|axios|python/i.test(ua) ? 'programa/script' : null;

  return { tipo, detalhe: [so, navegador].filter(Boolean).join(' · ') || null, userAgent: ua };
}
