<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Layer, Map } from 'leaflet';
import { api } from '../../api';
import { camadaCalor, camadaPontos, criarMapa } from '../mapa/mapaBase';

/**
 * Mapa de problemas climáticos e doenças: uma camada por vez.
 * "calor" mostra onde o problema se concentra; "pontos" mostra cada local registrado.
 * Hoje os registros são fictícios; depois virão do registro em campo dos alunos.
 */
interface Camada {
  chave: string; grupo: 'clima' | 'saude'; nome: string; descricao: string; exibicao: 'calor' | 'pontos';
  cor: string; total: number; ficticio: boolean; ultimo_registro: string | null;
}
interface Registro { lat: number; lng: number; intensidade: number; descricao?: string; territorio?: string; data: string }

const props = withDefaults(defineProps<{ altura?: number }>(), { altura: 420 });

const camadas = ref<Camada[]>([]);
const ativa = ref<Camada | null>(null);
const carregando = ref(false);
const erro = ref('');
const el = ref<HTMLDivElement | null>(null);
let mapa: Map | null = null;
let desenho: Layer | null = null;

const GRUPOS = [
  { chave: 'clima', rotulo: 'Problemas climáticos' },
  { chave: 'saude', rotulo: 'Doenças e agravos' },
] as const;
const doGrupo = (g: string) => camadas.value.filter((c) => c.grupo === g);
const algumaFicticia = computed(() => camadas.value.some((c) => c.ficticio));

async function selecionar(c: Camada) {
  if (!mapa || carregando.value) return;
  ativa.value = c;
  carregando.value = true;
  erro.value = '';
  try {
    const r = await api<{ registros: Registro[] }>(`/publico/mapa/camadas/${c.chave}`);
    if (desenho) mapa.removeLayer(desenho);
    desenho = c.exibicao === 'calor'
      ? await camadaCalor(r.registros.map((x) => [x.lat, x.lng, x.intensidade] as [number, number, number]), c.cor)
      : camadaPontos(r.registros.map((x) => ({
          lat: x.lat, lng: x.lng, titulo: c.nome,
          texto: [x.descricao, x.territorio, `Registrado em ${new Date(x.data + 'T12:00:00').toLocaleDateString('pt-BR')}`].filter(Boolean).join('. '),
        })), c.cor);
    desenho.addTo(mapa);
  } catch (e) {
    erro.value = 'Não foi possível carregar esta camada agora.';
  } finally {
    carregando.value = false;
  }
}

onMounted(async () => {
  if (!el.value) return;
  mapa = criarMapa(el.value);
  try {
    camadas.value = await api<Camada[]>('/publico/mapa/camadas');
    const inicial = camadas.value.find((c) => c.chave === 'chuva_enchente') ?? camadas.value[0];
    if (inicial) await selecionar(inicial);
  } catch {
    erro.value = 'Não foi possível carregar o mapa agora.';
  }
});
onBeforeUnmount(() => mapa?.remove());
</script>

<template>
  <div class="mapa-problemas">
    <div class="seletor">
      <div v-for="g in GRUPOS" :key="g.chave" class="grupo">
        <span class="rotulo-grupo">{{ g.rotulo }}</span>
        <div class="opcoes" role="radiogroup" :aria-label="g.rotulo">
          <button v-for="c in doGrupo(g.chave)" :key="c.chave" type="button" role="radio" :aria-checked="ativa?.chave === c.chave"
            class="opcao" :class="{ marcada: ativa?.chave === c.chave }" :style="{ '--cor': c.cor }" @click="selecionar(c)">
            <span class="marca" :class="c.exibicao"></span>{{ c.nome }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="ativa" class="explicacao">
      <strong>{{ ativa.nome }}:</strong> {{ ativa.descricao }}
      <span class="miudo">{{ ativa.exibicao === 'calor' ? 'Cor mais forte, maior concentração.' : 'Clique em um ponto para ver o registro.' }}
        {{ ativa.total }} registros.</span>
    </div>

    <div class="moldura">
      <div ref="el" class="mapa" :style="{ height: props.altura + 'px' }" role="img"
        :aria-label="ativa ? `Mapa de ${ativa.nome} em São João da Boa Vista` : 'Mapa de problemas e doenças'"></div>
      <div v-if="carregando" class="carregando">Carregando camada...</div>
    </div>
    <p v-if="erro" class="erro">{{ erro }}</p>
    <p v-if="algumaFicticia" class="miudo aviso-ficticio">
      Registros fictícios para demonstração. Os dados reais virão das vistorias e registros em campo das equipes do projeto.
      Doenças aparecem por região ou por foco ambiental, nunca pelo endereço de pacientes.
    </p>
  </div>
</template>

<style scoped>
.seletor { display: grid; gap: .75rem; grid-template-columns: 1fr 1fr; margin-bottom: .75rem; }
@media (max-width: 760px) { .seletor { grid-template-columns: 1fr; } }
.rotulo-grupo { display: block; font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--texto-2); margin-bottom: .35rem; }
.opcoes { display: flex; flex-wrap: wrap; gap: .35rem; }
.opcao { display: inline-flex; align-items: center; gap: .4rem; border: 1px solid var(--borda); background: #fff; border-radius: 999px;
  padding: .35rem .75rem; font: inherit; font-size: .84rem; cursor: pointer; color: var(--texto); }
.opcao:hover { border-color: var(--cor); }
.opcao.marcada { background: var(--cor); border-color: var(--cor); color: #fff; font-weight: 700; }
.marca { width: 10px; height: 10px; background: var(--cor); flex-shrink: 0; }
.marca.calor { border-radius: 3px; opacity: .8; }
.marca.pontos { border-radius: 50%; }
.opcao.marcada .marca { background: #fff; }
.explicacao { font-size: .9rem; background: #F6F7F5; border-radius: 8px; padding: .55rem .8rem; margin-bottom: .6rem; }
.explicacao .miudo { display: block; margin-top: .15rem; }
.moldura { position: relative; }
.mapa { width: 100%; border-radius: 10px; overflow: hidden; z-index: 0; }
.carregando { position: absolute; top: .6rem; left: 50%; transform: translateX(-50%); background: #fff; border-radius: 999px;
  padding: .3rem .9rem; font-size: .82rem; box-shadow: 0 2px 8px rgba(0, 0, 0, .15); z-index: 500; }
.miudo { font-size: .8rem; color: var(--texto-2); }
.aviso-ficticio { margin: .6rem 0 0; }
</style>
