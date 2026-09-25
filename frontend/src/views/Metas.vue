<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, EIXOS, GRUPOS, STATUS } from '../api';
import { sessao } from '../sessao';

interface Meta {
  id: number; codigo: string; grupo: number; eixo: string; titulo: string; status: string;
  prazo_inicio: number | null; prazo_fim: number | null;
  n_acoes: number; n_acoes_concluidas: number; n_indicadores: number; fichas_completas: number;
}
const metas = ref<Meta[]>([]);
const escopo = ref('');
const erro = ref('');
const grupo = ref<number | null>(null);
const eixo = ref('');
const busca = ref('');

onMounted(async () => {
  try {
    const r = await api<{ escopo: string; metas: Meta[] }>('/metas');
    metas.value = r.metas;
    escopo.value = r.escopo;
    if (r.escopo === 'grupo') grupo.value = sessao.eu?.grupo ?? null;
  } catch (e) {
    erro.value = (e as Error).message;
  }
});

const gruposVisiveis = computed(() => [...new Set(metas.value.map((m) => m.grupo))].sort());
const filtradas = computed(() => {
  const b = busca.value.trim().toLowerCase();
  return metas.value.filter((m) => (!grupo.value || m.grupo === grupo.value) && (!eixo.value || m.eixo === eixo.value)
    && (!b || `${m.codigo} ${m.titulo}`.toLowerCase().includes(b)));
});
const porEixo = computed(() => ['I', 'II', 'III']
  .map((e) => ({ eixo: e, metas: filtradas.value.filter((m) => m.eixo === e) }))
  .filter((g) => g.metas.length));
const resumo = computed(() => {
  const f = filtradas.value;
  return {
    total: f.length,
    status: Object.keys(STATUS).map((s) => ({ s, n: f.filter((m) => m.status === s).length })),
    fichas: f.reduce((t, m) => t + m.fichas_completas, 0),
    indicadores: f.reduce((t, m) => t + m.n_indicadores, 0),
    acoes: f.reduce((t, m) => t + m.n_acoes, 0),
  };
});
const prazo = (m: Meta) => m.prazo_inicio != null ? `mês ${m.prazo_inicio}–${m.prazo_fim}` : '—';
</script>

<template>
  <h1>Metas e ações</h1>
  <p class="sub">
    Meta → indicador → ações. <template v-if="escopo === 'grupo'">Você vê as metas do {{ GRUPOS[sessao.eu?.grupo ?? 0] ?? 'seu grupo' }}.</template>
    <template v-else>Todas as metas do projeto.</template>
  </p>
  <p v-if="erro" class="erro">{{ erro }}</p>

  <section class="resumo">
    <div class="cartao kpi"><div class="n">{{ resumo.total }}</div><div>metas</div></div>
    <div class="cartao kpi">
      <div class="barras">
        <span v-for="x in resumo.status" :key="x.s" class="selo" :class="STATUS[x.s].cor">{{ x.n }} {{ STATUS[x.s].rotulo.toLowerCase() }}</span>
      </div>
      <div>situação</div>
    </div>
    <div class="cartao kpi" :class="{ alerta: resumo.fichas < resumo.indicadores }">
      <div class="n">{{ resumo.fichas }}<small>/{{ resumo.indicadores }}</small></div><div>fichas de indicador completas</div>
    </div>
    <div class="cartao kpi"><div class="n">{{ resumo.acoes }}</div><div>ações cadastradas</div></div>
  </section>

  <section class="cartao filtros">
    <div v-if="gruposVisiveis.length > 1" class="abas">
      <button :class="{ ativa: !grupo }" @click="grupo = null">Todos os grupos</button>
      <button v-for="g in gruposVisiveis" :key="g" :class="{ ativa: grupo === g }" @click="grupo = g">{{ GRUPOS[g] }}</button>
    </div>
    <div class="linha">
      <select v-model="eixo"><option value="">Todos os eixos</option><option v-for="(r, e) in EIXOS" :key="e" :value="e">{{ r }}</option></select>
      <input v-model="busca" placeholder="Buscar meta…" />
    </div>
  </section>

  <section v-for="g in porEixo" :key="g.eixo" class="eixo">
    <h2>{{ EIXOS[g.eixo] }} <small>{{ g.metas.length }} metas</small></h2>
    <RouterLink v-for="m in g.metas" :key="m.id" :to="`/metas/${m.id}`" class="cartao meta">
      <div class="topo">
        <span class="codigo">{{ m.codigo }}</span>
        <span class="selo teal">{{ GRUPOS[m.grupo] }}</span>
        <span class="selo" :class="STATUS[m.status].cor">{{ STATUS[m.status].rotulo }}</span>
        <span class="prazo">{{ prazo(m) }}</span>
      </div>
      <div class="titulo">{{ m.titulo }}</div>
      <div class="rodape">
        <span :class="{ falta: m.fichas_completas < m.n_indicadores }">
          ficha do indicador: {{ m.fichas_completas }}/{{ m.n_indicadores }} completa{{ m.n_indicadores > 1 ? 's' : '' }}
        </span>
        <span>{{ m.n_acoes }} ações<template v-if="m.n_acoes"> · {{ m.n_acoes_concluidas }} concluídas</template></span>
      </div>
    </RouterLink>
  </section>
  <p v-if="!erro && metas.length && !filtradas.length" class="sub">Nenhuma meta com esses filtros.</p>
</template>

<style scoped>
.resumo { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); margin-bottom: 1rem; }
.kpi { padding: 1rem; font-size: .85rem; color: var(--texto-2); }
.kpi .n { font-size: 1.8rem; font-weight: 800; color: var(--teal-900); }
.kpi .n small { font-size: 1rem; color: var(--texto-2); }
.kpi.alerta .n { color: var(--vermelho); }
.barras { display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: .4rem; }
.filtros { display: flex; flex-direction: column; gap: .75rem; margin-bottom: 1.25rem; }
.abas { display: flex; gap: .25rem; flex-wrap: wrap; }
.abas button { border: 1px solid var(--borda); background: #fff; padding: .35rem .8rem; border-radius: 999px; font: inherit; font-size: .85rem; cursor: pointer; color: var(--texto-2); }
.abas button.ativa { background: var(--teal-700); border-color: var(--teal-700); color: #fff; font-weight: 600; }
.linha { display: flex; gap: .5rem; flex-wrap: wrap; }
.linha select { max-width: 220px; }
.linha input { max-width: 320px; }
.eixo { margin-bottom: 1.5rem; }
.eixo h2 small { color: var(--texto-2); font-weight: 400; font-size: .85rem; }
.meta { display: block; text-decoration: none; color: inherit; margin-bottom: .5rem; padding: .9rem 1.1rem; }
.meta:hover { border-color: var(--teal-700); }
.topo { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; font-size: .8rem; }
.codigo { font-weight: 800; color: var(--teal-900); font-family: ui-monospace, Consolas, monospace; }
.prazo { margin-left: auto; color: var(--texto-2); }
.titulo { font-weight: 600; margin: .4rem 0; }
.rodape { display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: .8rem; color: var(--texto-2); }
.falta { color: #B3302F; }
</style>
