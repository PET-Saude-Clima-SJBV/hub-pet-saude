<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Map } from 'leaflet';
import { CENTRO_SJBV, camadaCalor, criarMapa } from '../mapa/mapaBase';

/**
 * Mapa de calor geral do município.
 * ATENÇÃO: intensidades ILUSTRATIVAS. Quando houver dados reais, os pontos chegam por `pontos`.
 */
const props = withDefaults(defineProps<{
  pontos?: [number, number, number][];   // [lat, lng, intensidade 0..1]
  altura?: number;
}>(), { altura: 380 });

const el = ref<HTMLDivElement | null>(null);
let mapa: Map | null = null;

// regiões fictícias ao redor do centro, com intensidades diferentes (só para ilustrar)
function pontosIlustrativos(): [number, number, number][] {
  const [lat0, lng0] = CENTRO_SJBV;
  const regioes: [number, number, number, number][] = [
    [0.000, 0.000, 0.95, 0.006], [0.012, 0.010, 0.75, 0.007], [-0.014, 0.008, 0.55, 0.008],
    [0.006, -0.016, 0.85, 0.006], [-0.010, -0.012, 0.35, 0.009], [0.020, -0.004, 0.45, 0.007],
  ];
  let semente = 7;
  const aleatorio = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
  const pts: [number, number, number][] = [];
  for (const [dLat, dLng, int, esp] of regioes) {
    for (let i = 0; i < 40; i++) {
      pts.push([lat0 + dLat + (aleatorio() - 0.5) * esp * 2, lng0 + dLng + (aleatorio() - 0.5) * esp * 2, int * (0.6 + aleatorio() * 0.4)]);
    }
  }
  return pts;
}

onMounted(async () => {
  if (!el.value) return;
  mapa = criarMapa(el.value);
  (await camadaCalor(props.pontos ?? pontosIlustrativos())).addTo(mapa);
});
onBeforeUnmount(() => mapa?.remove());
</script>

<template>
  <div class="mapa-calor">
    <div ref="el" class="mapa" :style="{ height: `min(${altura}px, 62vh)` }" role="img"
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
