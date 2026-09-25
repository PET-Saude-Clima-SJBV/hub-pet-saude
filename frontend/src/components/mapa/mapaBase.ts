import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Base comum dos mapas do HUB: centro de São João da Boa Vista e mapa do OpenStreetMap (gratuito, sem chave). */
export const CENTRO_SJBV: [number, number] = [-21.9692, -46.7983];

export function criarMapa(el: HTMLElement, opcoes: { zoom?: number } = {}) {
  const mapa = L.map(el, { center: CENTRO_SJBV, zoom: opcoes.zoom ?? 13, scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
  }).addTo(mapa);
  return mapa;
}

let pluginCarregado: Promise<unknown> | null = null;
/** O plugin de calor espera o Leaflet como variável global; carrega uma vez só. */
function carregarPluginCalor() {
  (window as any).L = L;
  return (pluginCarregado ??= import('leaflet.heat'));
}

/** Mistura a cor com branco (0 = cor pura, 1 = branco). */
function clarear(hex: string, quanto: number) {
  const n = parseInt(hex.slice(1), 16);
  const canal = (c: number) => Math.round(c + (255 - c) * quanto).toString(16).padStart(2, '0');
  return `#${canal(n >> 16)}${canal((n >> 8) & 255)}${canal(n & 255)}`;
}

export const GRADIENTE_RISCO = { 0.2: '#1D9E75', 0.45: '#E0A040', 0.7: '#E07A40', 0.95: '#E24B4A' };

/** Camada de calor. `cor` gera um gradiente de uma cor só (para camadas temáticas). */
export async function camadaCalor(pontos: [number, number, number][], cor?: string) {
  await carregarPluginCalor();
  return (L as any).heatLayer(pontos, {
    radius: 30, blur: 24, maxZoom: 13, max: 1, minOpacity: 0.35,
    gradient: cor ? { 0.25: clarear(cor, 0.7), 0.6: clarear(cor, 0.25), 1: cor } : GRADIENTE_RISCO,
  }) as L.Layer;
}

/** Camada de pontos focais (círculos com a cor da camada e um balão ao clicar). */
export function camadaPontos(pontos: { lat: number; lng: number; titulo: string; texto?: string }[], cor: string) {
  const grupo = L.layerGroup();
  for (const p of pontos) {
    L.circleMarker([p.lat, p.lng], { radius: 7, color: '#fff', weight: 2, fillColor: cor, fillOpacity: 0.95 })
      .bindPopup(`<strong>${escapar(p.titulo)}</strong>${p.texto ? `<br>${escapar(p.texto)}` : ''}`)
      .addTo(grupo);
  }
  return grupo;
}

function escapar(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
