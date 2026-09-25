<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, GRUPOS } from '../api';
import { itens, nomeDe } from '../catalogos';
import ImportarArquivo from '../components/ImportarArquivo.vue';

interface Indicador {
  id: number; nome: string; oficial: boolean; meta_id: number; meta_codigo: string; meta_titulo: string; grupo: number; eixo: string;
  tipo: string | null; periodicidade: string | null; unidade: string | null; valor_alvo: string | null; responsavel: string | null;
  ficha_preenchida: number; ficha_total: number;
}
const dados = ref<{ indicadores: Indicador[]; pode_importar: boolean } | null>(null);
const erro = ref('');
const aviso = ref('');
const grupo = ref<number | ''>('');
const tipo = ref('');
const soIncompletas = ref(false);
const busca = ref('');

async function carregar() {
  try { dados.value = await api('/indicadores'); } catch (e) { erro.value = (e as Error).message; }
}
onMounted(carregar);

const lista = computed(() => {
  const b = busca.value.trim().toLowerCase();
  return (dados.value?.indicadores ?? [])
    .filter((i) => !grupo.value || i.grupo === grupo.value)
    .filter((i) => !tipo.value || i.tipo === tipo.value)
    .filter((i) => !soIncompletas.value || i.ficha_preenchida < i.ficha_total)
    .filter((i) => !b || `${i.nome} ${i.meta_codigo} ${i.meta_titulo}`.toLowerCase().includes(b));
});
const total = computed(() => dados.value?.indicadores.length ?? 0);
const completas = computed(() => dados.value?.indicadores.filter((i) => i.ficha_preenchida === i.ficha_total).length ?? 0);
const grupos = computed(() => [...new Set((dados.value?.indicadores ?? []).map((i) => i.grupo))].sort());
function importado(msg: string) { aviso.value = msg; carregar(); }
</script>

<template>
  <h1>Indicadores</h1>
  <p class="sub">Todos os indicadores das metas e a situação de cada ficha. O Guia pede a ficha completa antes da coleta começar.</p>
  <p v-if="erro" class="erro">{{ erro }}</p>
  <p v-if="aviso" class="selo verde">{{ aviso }}</p>

  <section v-if="dados" class="resumo">
    <div class="cartao kpi"><div class="n">{{ total }}</div>indicadores</div>
    <div class="cartao kpi"><div class="n verde">{{ completas }}</div>fichas completas</div>
    <div class="cartao kpi"><div class="n" :class="{ vermelho: total - completas > 0 }">{{ total - completas }}</div>fichas incompletas</div>
  </section>

  <section class="cartao">
    <div class="filtros">
      <input v-model="busca" placeholder="Buscar indicador ou meta..." />
      <select v-if="grupos.length > 1" v-model="grupo">
        <option value="">Todos os grupos</option>
        <option v-for="g in grupos" :key="g" :value="g">{{ GRUPOS[g] }}</option>
      </select>
      <select v-model="tipo">
        <option value="">Todos os tipos</option>
        <option v-for="t in itens('tipos_indicador')" :key="t.codigo" :value="t.codigo">{{ t.nome }}</option>
      </select>
      <label class="check"><input v-model="soIncompletas" type="checkbox" /> só fichas incompletas</label>
    </div>

    <div class="rolagem">
      <table class="tabela">
        <thead><tr><th>Meta</th><th>Indicador</th><th>Tipo</th><th>Periodicidade</th><th>Alvo</th><th>Ficha</th><th></th></tr></thead>
        <tbody>
          <tr v-for="i in lista" :key="i.id">
            <td class="meta"><strong>{{ i.meta_codigo }}</strong><div class="miudo">{{ GRUPOS[i.grupo] }} · Eixo {{ i.eixo }}</div></td>
            <td>{{ i.nome }}<span v-if="i.oficial" class="selo">oficial</span>
              <div class="miudo">{{ i.meta_titulo }}</div></td>
            <td>{{ nomeDe('tipos_indicador', i.tipo) || '-' }}</td>
            <td>{{ nomeDe('periodicidades', i.periodicidade) || '-' }}</td>
            <td>{{ i.valor_alvo ? `${i.valor_alvo} ${i.unidade ?? ''}` : '-' }}</td>
            <td><span class="selo" :class="i.ficha_preenchida === i.ficha_total ? 'verde' : 'ambar'">{{ i.ficha_preenchida }}/{{ i.ficha_total }}</span></td>
            <td><RouterLink :to="`/metas/${i.meta_id}`">abrir ficha</RouterLink></td>
          </tr>
          <tr v-if="!lista.length"><td colspan="7" class="miudo">Nenhum indicador com esses filtros.</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <ImportarArquivo v-if="dados?.pode_importar" class="bloco" url-modelo="/api/indicadores/modelo" url-importar="/indicadores/importar"
    titulo="Importar fichas de indicador"
    explicacao="Aceita o modelo ou a própria aba &quot;Indicadores&quot; da planilha de mapeamento. Casa pela meta (código ou texto) e pelo nome do indicador: se já existir, completa a ficha; se não, cria. Campo vazio no arquivo não apaga o que já está na ficha."
    @importado="importado" />
</template>

<style scoped>
.resumo { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom: 1rem; }
.kpi { padding: 1rem; font-size: .85rem; color: var(--texto-2); }
.kpi .n { font-size: 1.8rem; font-weight: 800; color: var(--teal-900); }
.kpi .n.verde { color: var(--verde); }
.kpi .n.vermelho { color: var(--vermelho); }
.filtros { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem; }
.filtros input { max-width: 280px; }
.filtros select { max-width: 200px; }
.check { display: flex; gap: .4rem; align-items: center; font-size: .85rem; color: var(--texto-2); }
.check input { width: auto; }
.meta { white-space: nowrap; }
.miudo { font-size: .8rem; color: var(--texto-2); }
.selo { margin-left: .35rem; }
.bloco { margin-top: 1rem; }
</style>
