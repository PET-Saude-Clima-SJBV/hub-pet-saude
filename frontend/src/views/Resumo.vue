<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, GRUPOS, horas, PAPEIS, VALIDACAO } from '../api';
import { carregarCatalogos, nomeDe } from '../catalogos';
import { sessao } from '../sessao';

interface Pessoa { id: string; nome: string; papel: string; grupo: number | null }
interface Resumo {
  pessoa: Pessoa; mes: string; meta_semanal: number;
  dias: { data: string; minutos: number; n: number }[];
  tipos: { tipo: string; minutos: number }[];
  validacao: { validacao: string; n: number; minutos: number }[];
  semanas: { inicio: string; minutos: number }[];
  pendencias: { id: string; data: string; tipo: string; descricao: string; validacao: string; motivo_devolucao: string | null; minutos: number }[];
}

const pessoas = ref<Pessoa[]>([]);
const pessoaId = ref('');
const mes = ref(new Date().toLocaleDateString('sv-SE').slice(0, 7));
const r = ref<Resumo | null>(null);
const erro = ref('');

onMounted(async () => {
  carregarCatalogos();
  try {
    pessoas.value = await api<Pessoa[]>('/resumo/pessoas');
    pessoaId.value = pessoas.value.find((p) => p.id === sessao.eu?.id)?.id ?? pessoas.value[0]?.id ?? '';
  } catch (e) {
    erro.value = (e as Error).message;
  }
});
watch([pessoaId, mes], async () => {
  if (!pessoaId.value) return;
  erro.value = '';
  try {
    r.value = await api<Resumo>(`/resumo/${pessoaId.value}?mes=${mes.value}`);
  } catch (e) {
    erro.value = (e as Error).message;
  }
});

// calendário do mês (semanas começando na segunda)
const calendario = computed(() => {
  if (!r.value) return [];
  const [a, m] = r.value.mes.split('-').map(Number);
  const primeiro = new Date(a, m - 1, 1);
  const diasNoMes = new Date(a, m, 0).getDate();
  const vazios = (primeiro.getDay() + 6) % 7;
  const porData = new Map(r.value.dias.map((d) => [d.data, d.minutos]));
  const celulas: ({ dia: number; minutos: number } | null)[] = Array(vazios).fill(null);
  for (let d = 1; d <= diasNoMes; d++) {
    const data = `${r.value.mes}-${String(d).padStart(2, '0')}`;
    celulas.push({ dia: d, minutos: porData.get(data) ?? 0 });
  }
  return celulas;
});
const intensidade = (min: number) => min === 0 ? 0 : min < 60 ? 1 : min < 120 ? 2 : min < 240 ? 3 : 4;
const totalMes = computed(() => r.value?.dias.reduce((t, d) => t + d.minutos, 0) ?? 0);
const maxTipo = computed(() => Math.max(1, ...(r.value?.tipos.map((t) => t.minutos) ?? [1])));
const val = (k: string) => r.value?.validacao.find((v) => v.validacao === k) ?? { n: 0, minutos: 0 };
const nomeMes = computed(() => new Date(mes.value + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
</script>

<template>
  <h1>Resumo por pessoa</h1>
  <p class="sub">Horas do mês, semanas contra a meta de 8h, tipos de atividade e o que está pendente.</p>
  <p v-if="erro" class="erro">{{ erro }}</p>

  <section class="cartao filtros">
    <label class="campo">Pessoa
      <select v-model="pessoaId">
        <option v-for="p in pessoas" :key="p.id" :value="p.id">{{ p.nome }} ({{ PAPEIS[p.papel] }}{{ p.grupo ? ', ' + GRUPOS[p.grupo] : '' }})</option>
      </select>
    </label>
    <label class="campo">Mês <input v-model="mes" type="month" /></label>
  </section>

  <template v-if="r">
    <section class="kpis">
      <div class="cartao kpi"><div class="n">{{ horas(totalMes) }}</div>em {{ nomeMes }}</div>
      <div class="cartao kpi"><div class="n verde">{{ val('validada').n }}</div>validadas · {{ horas(val('validada').minutos) }}</div>
      <div class="cartao kpi"><div class="n azul">{{ val('pendente').n }}</div>aguardando validação</div>
      <div class="cartao kpi"><div class="n vermelho">{{ val('devolvida').n }}</div>devolvidas</div>
    </section>

    <div class="grade duas">
      <section class="cartao">
        <h2>Calendário</h2>
        <div class="cal cab"><span v-for="d in ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']" :key="d">{{ d }}</span></div>
        <div class="cal">
          <div v-for="(c, i) in calendario" :key="i" class="celula" :class="c ? 'n' + intensidade(c.minutos) : 'fora'"
            :title="c ? `${c.dia}: ${horas(c.minutos)}` : ''">
            <template v-if="c"><b>{{ c.dia }}</b><small v-if="c.minutos">{{ horas(c.minutos) }}</small></template>
          </div>
        </div>
      </section>

      <section class="cartao">
        <h2>Semanas × meta de 8h</h2>
        <div v-for="s in r.semanas" :key="s.inicio" class="barra-linha">
          <span class="rotulo">sem. {{ new Date(s.inicio + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }}</span>
          <div class="barra"><div :style="{ width: Math.min(100, s.minutos / r.meta_semanal * 100) + '%' }" :class="{ ok: s.minutos >= r.meta_semanal }"></div></div>
          <span class="valor">{{ horas(s.minutos) }}</span>
        </div>
        <p v-if="!r.semanas.length" class="miudo">Sem atividades neste mês.</p>

        <h2 class="espaco">Por tipo</h2>
        <div v-for="t in r.tipos" :key="t.tipo" class="barra-linha">
          <span class="rotulo">{{ nomeDe('tipos_atividade', t.tipo) }}</span>
          <div class="barra tipo"><div :style="{ width: t.minutos / maxTipo * 100 + '%' }"></div></div>
          <span class="valor">{{ horas(t.minutos) }}</span>
        </div>
      </section>
    </div>

    <section class="cartao">
      <h2>Pendências <small>{{ r.pendencias.length }}</small></h2>
      <table v-if="r.pendencias.length" class="tabela">
        <tbody>
          <tr v-for="p in r.pendencias" :key="p.id">
            <td class="quando">{{ new Date(p.data + 'T12:00:00').toLocaleDateString('pt-BR') }}</td>
            <td>{{ nomeDe('tipos_atividade', p.tipo) }}</td>
            <td>{{ p.descricao }}<div v-if="p.motivo_devolucao" class="erro-mini">{{ p.motivo_devolucao }}</div></td>
            <td>{{ horas(p.minutos) }}</td>
            <td><span class="selo" :class="VALIDACAO[p.validacao].cor">{{ VALIDACAO[p.validacao].rotulo }}</span></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="miudo">Nada pendente.</p>
    </section>
  </template>
</template>

<style scoped>
.filtros { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.filtros .campo:first-child { flex: 1; min-width: 240px; }
.kpis { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom: 1rem; }
.kpi { font-size: .82rem; color: var(--texto-2); padding: 1rem; }
.kpi .n { font-size: 1.7rem; font-weight: 800; color: var(--teal-900); }
.kpi .n.verde { color: var(--verde); } .kpi .n.azul { color: var(--azul); } .kpi .n.vermelho { color: var(--vermelho); }
section.cartao { margin-bottom: 1rem; }
h2 small { color: var(--texto-2); font-weight: 400; }
.espaco { margin-top: 1.25rem; }
.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal.cab span { font-size: .72rem; color: var(--texto-2); text-align: center; padding-bottom: 2px; }
.celula { aspect-ratio: 1.15; border-radius: 6px; padding: 3px 5px; display: flex; flex-direction: column; font-size: .72rem; }
.celula small { margin-top: auto; font-size: .68rem; }
.celula.fora { background: transparent; }
.celula.n0 { background: #F1F2EE; color: var(--texto-2); }
.celula.n1 { background: #D5ECE6; } .celula.n2 { background: #A6D7CA; }
.celula.n3 { background: #4FAE96; color: #fff; } .celula.n4 { background: var(--teal-700); color: #fff; }
.barra-linha { display: grid; grid-template-columns: 110px 1fr 52px; gap: .5rem; align-items: center; font-size: .82rem; margin-bottom: .4rem; }
.rotulo { color: var(--texto-2); }
.valor { text-align: right; font-weight: 600; }
.barra { height: 12px; background: #EEF0EC; border-radius: 999px; overflow: hidden; position: relative; }
.barra div { height: 100%; background: var(--azul); }
.barra div.ok { background: var(--verde); }
.barra.tipo div { background: var(--teal-700); }
.quando { white-space: nowrap; color: var(--texto-2); }
.erro-mini { color: #B3302F; font-size: .8rem; }
.miudo { font-size: .85rem; color: var(--texto-2); }
</style>
