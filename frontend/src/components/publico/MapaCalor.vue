<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Mapa de calor de São João da Boa Vista.
 * ATENÇÃO: intensidades ILUSTRATIVAS. Os territórios reais serão definidos pelo Grupo I e os dados
 * virão do HUB (PostGIS); aí este componente passa a receber os pontos por `props`.
 */
const props = withDefaults(defineProps<{
  pontos?: [number, number, number][];   // [lat, lng, intensidade 0..1]
  altura?: number;
}>(), { altura: 380 });

const CENTRO: [number, number] = [-21.9692, -46.7983];
const el = ref<HTMLDivElement | null>(null);
let mapa: L.Map | null = null;

// regiões fictícias ao redor do centro, com intensidades diferentes (só para ilustrar)
function pontosIlustrativos(): [number, number, number][] {
  const regioes: [number, number, number, number][] = [
    // dLat, dLng, intensidade, espalhamento
    [0.000, 0.000, 0.95, 0.006], [0.012, 0.010, 0.75, 0.007], [-0.014, 0.008, 0.55, 0.008],
    [0.006, -0.016, 0.85, 0.006], [-0.010, -0.012, 0.35, 0.009], [0.020, -0.004, 0.45, 0.007],
  ];
  let semente = 7;
  const aleatorio = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
  const pts: [number, number, number][] = [];
  for (const [dLat, dLng, int, esp] of regioes) {
    for (let i = 0; i < 40; i++) {
      pts.push([CENTRO[0] + dLat + (aleatorio() - 0.5) * esp * 2, CENTRO[1] + dLng + (aleatorio() - 0.5) * esp * 2, int * (0.6 + aleatorio() * 0.4)]);
    }
  }
  return pts;
}

onMounted(async () => {
  if (!el.value) return;
  // o plugin de calor espera o Leaflet como variável global
  (window as any).L = L;
  await import('leaflet.heat');
  mapa = L.map(el.value, { center: CENTRO, zoom: 13, scrollWheelZoom: false, attributionControl: true });
  // mapa base do OpenStreetMap: gratuito e sem chave (exige só a atribuição e uso moderado)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
  }).addTo(mapa);
  // maxZoom igual ao zoom inicial: a intensidade não "some" ao afastar o mapa
  (L as any).heatLayer(props.pontos ?? pontosIlustrativos(), {
    radius: 30, blur: 24, maxZoom: 13, max: 1, minOpacity: 0.35,
    gradient: { 0.2: '#1D9E75', 0.45: '#E0A040', 0.7: '#E07A40', 0.95: '#E24B4A' },
  }).addTo(mapa);
});

onBeforeUnmount(() => mapa?.remove());
</script>

<template>
  <div class="mapa-calor">
    <div ref="el" class="mapa" :style="{ height: altura + 'px' }" role="img"
      aria-label="Mapa de calor ilustrativo de São João da Boa Vista"></div>
    <div class="legenda">
      <span>menor</span><i class="rampa"></i><span>maior intensidade</span>
    </div>
  </div>
</template>

<style scoped>
.mapa { width: 100%; border-radius: 10px; overflow: hidden; z-index: 0; }
.legenda { display: flex; align-items: center; gap: .5rem; font-size: .78rem; color: var(--texto-2); margin-top: .5rem; }
.rampa { display: inline-block; width: 140px; height: 8px; border-radius: 999px; background: linear-gradient(90deg, #1D9E75, #E0A040, #E07A40, #E24B4A); }
</style>
