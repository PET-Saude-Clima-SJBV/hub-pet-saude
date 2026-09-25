<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../api';

interface Orientacao { nivel: 'tranquilo' | 'atencao' | 'alerta'; titulo: string; texto: string }
interface Clima {
  local: string; medido_em: string; condicao: { descricao: string; icone: string };
  temperatura: number; sensacao: number; umidade: number; vento_kmh: number; chuva_mm: number;
  hoje: { maxima: number; minima: number; chuva_mm: number; uv_max: number };
  nivel: Orientacao['nivel']; orientacoes: Orientacao[]; fonte: string;
}

const clima = ref<Clima | null>(null);
const indisponivel = ref(false);

onMounted(async () => {
  try {
    clima.value = await api<Clima>('/publico/clima');
  } catch {
    indisponivel.value = true;
  }
});

const ROTULO = { tranquilo: 'Tudo tranquilo', atencao: 'Atenção', alerta: 'Alerta' };
const hora = (s: string) => s.slice(11, 16);
const r = (n: number) => Math.round(n);
</script>

<template>
  <section class="cartao clima" :class="clima?.nivel" aria-live="polite">
    <template v-if="clima">
      <div class="agora">
        <div class="icone" aria-hidden="true">{{ clima.condicao.icone }}</div>
        <div>
          <div class="temp">{{ r(clima.temperatura) }}°<small>C</small></div>
          <div class="cond">{{ clima.condicao.descricao }} · sensação {{ r(clima.sensacao) }}°C</div>
          <div class="miudo">{{ clima.local }}, agora ({{ hora(clima.medido_em) }})</div>
        </div>
      </div>
      <dl class="medidas">
        <div><dt>Umidade</dt><dd>{{ clima.umidade }}%</dd></div>
        <div><dt>Vento</dt><dd>{{ r(clima.vento_kmh) }} km/h</dd></div>
        <div><dt>Hoje</dt><dd>{{ r(clima.hoje.minima) }}° / {{ r(clima.hoje.maxima) }}°</dd></div>
        <div><dt>Chuva hoje</dt><dd>{{ clima.hoje.chuva_mm.toLocaleString('pt-BR') }} mm</dd></div>
      </dl>
      <div class="orientacoes">
        <div class="nivel"><span class="bolinha"></span>{{ ROTULO[clima.nivel] }}</div>
        <div v-for="o in clima.orientacoes" :key="o.titulo" class="orientacao" :class="o.nivel">
          <strong>{{ o.titulo }}</strong>
          <span>{{ o.texto }}</span>
        </div>
      </div>
      <p class="fonte">Fonte: {{ clima.fonte }}. Orientação informativa — siga sempre os avisos oficiais da Defesa Civil (199).</p>
    </template>
    <p v-else-if="indisponivel" class="miudo">Os dados do clima estão indisponíveis no momento.</p>
    <p v-else class="miudo">Carregando o clima…</p>
  </section>
</template>

<style scoped>
.clima { display: grid; gap: 1rem 1.5rem; grid-template-columns: auto 1fr; align-items: center; border-top: 5px solid var(--verde); }
.clima.atencao { border-top-color: var(--ambar); }
.clima.alerta { border-top-color: var(--vermelho); }
@media (max-width: 760px) { .clima { grid-template-columns: 1fr; } }
.agora { display: flex; gap: .9rem; align-items: center; }
.icone { font-size: 3rem; line-height: 1; }
.temp { font-size: 2.6rem; font-weight: 800; color: var(--teal-900); line-height: 1; }
.temp small { font-size: 1.1rem; font-weight: 600; }
.cond { font-weight: 600; margin-top: .2rem; }
.miudo { font-size: .8rem; color: var(--texto-2); margin: 0; }
.medidas { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; margin: 0; }
@media (max-width: 480px) { .medidas { grid-template-columns: repeat(2, 1fr); } }
.medidas div { background: #F6F7F5; border-radius: 8px; padding: .5rem .7rem; }
.medidas dt { font-size: .72rem; color: var(--texto-2); text-transform: uppercase; letter-spacing: .04em; }
.medidas dd { margin: .1rem 0 0; font-weight: 700; font-size: 1.05rem; }
.orientacoes { grid-column: 1 / -1; display: flex; flex-direction: column; gap: .5rem; }
.nivel { display: flex; align-items: center; gap: .5rem; font-weight: 800; font-size: .95rem; color: #13714F; }
.atencao .nivel { color: #8A5A10; }
.alerta .nivel { color: #B3302F; }
.bolinha { width: 12px; height: 12px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 18%, transparent); }
.orientacao { display: flex; flex-direction: column; gap: .15rem; padding: .65rem .85rem; border-radius: 8px; font-size: .9rem; background: #E3F4EE; }
.orientacao.atencao { background: #FDF3E1; }
.orientacao.alerta { background: #FDEDED; }
.orientacao span { color: var(--texto-2); }
.fonte { grid-column: 1 / -1; font-size: .75rem; color: var(--texto-2); margin: 0; }
</style>
