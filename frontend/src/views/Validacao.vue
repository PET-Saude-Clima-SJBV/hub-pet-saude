<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, GRUPOS, horas, PAPEIS, TIPOS_ATIVIDADE } from '../api';

interface Atividade {
  id: string; data: string; hora_inicio: string; hora_fim: string; minutos: number; tipo: string; modalidade: string;
  territorio: string | null; meta_codigo: string | null; acao_titulo: string | null; descricao: string;
  evidencias: { id: string; tipo: string; nome: string; url: string | null }[];
}
interface Cartao { pessoa: { id: string; nome: string; papel: string; grupo: number | null }; semana: string; minutos: number; sem_evidencia: number; atividades: Atividade[] }

const cartoes = ref<Cartao[]>([]);
const marcadas = ref<Set<string>>(new Set());
const aberto = ref<string | null>(null);
const erro = ref('');
const aviso = ref('');
const carregando = ref(true);

async function carregar() {
  carregando.value = true;
  try {
    cartoes.value = await api<Cartao[]>('/validacao/fila');
    marcadas.value = new Set(cartoes.value.flatMap((c) => c.atividades.filter((a) => a.evidencias.length).map((a) => a.id)));
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    carregando.value = false;
  }
}
onMounted(carregar);

const chave = (c: Cartao) => `${c.pessoa.id}|${c.semana}`;
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
function dias(c: Cartao) {
  return DIAS.map((rotulo, i) => {
    const d = new Date(c.semana + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const data = d.toLocaleDateString('sv-SE');
    const lista = c.atividades.filter((a) => a.data === data);
    return { rotulo, data, lista, minutos: lista.reduce((t, a) => t + a.minutos, 0) };
  });
}
function alternarDia(lista: Atividade[]) {
  const ids = lista.filter((a) => a.evidencias.length).map((a) => a.id);
  const todas = ids.every((id) => marcadas.value.has(id));
  const s = new Set(marcadas.value);
  for (const id of ids) todas ? s.delete(id) : s.add(id);
  marcadas.value = s;
}
function alternar(id: string) {
  const s = new Set(marcadas.value);
  s.has(id) ? s.delete(id) : s.add(id);
  marcadas.value = s;
}
const selecionadas = (c: Cartao) => c.atividades.filter((a) => marcadas.value.has(a.id));
const totalMarcado = computed(() => marcadas.value.size);

async function decidir(c: Cartao, acao: 'validar' | 'devolver') {
  const ids = selecionadas(c).map((a) => a.id);
  if (!ids.length) return;
  let motivo: string | null = null;
  if (acao === 'devolver') {
    motivo = prompt(`Motivo da devolução para ${c.pessoa.nome} (ela verá esta mensagem):`);
    if (!motivo?.trim()) return;
  }
  erro.value = aviso.value = '';
  try {
    await api('/validacao', { corpo: { ids, acao, motivo } });
    aviso.value = `${ids.length} atividade(s) ${acao === 'validar' ? 'validada(s)' : 'devolvida(s)'} de ${c.pessoa.nome}.`;
    await carregar();
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
const semanaTexto = (s: string) => {
  const ini = new Date(s + 'T12:00:00');
  const fim = new Date(ini); fim.setDate(fim.getDate() + 6);
  return `${ini.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
};
</script>

<template>
  <h1>Validação</h1>
  <p class="sub">Confira a semana inteira de cada pessoa de uma vez. Marque os dias que estão certos e valide, ou devolva com o motivo.</p>
  <p v-if="erro" class="erro">{{ erro }}</p>
  <p v-if="aviso" class="selo verde">{{ aviso }}</p>

  <p v-if="!carregando && !cartoes.length" class="cartao vazio">Nenhuma atividade aguardando validação. 🎉</p>
  <p v-else-if="cartoes.length" class="miudo">{{ cartoes.length }} semana(s) para conferir · {{ totalMarcado }} atividade(s) marcada(s)</p>

  <section v-for="c in cartoes" :key="chave(c)" class="cartao pessoa">
    <div class="cabeca">
      <div>
        <h2>{{ c.pessoa.nome }}</h2>
        <div class="miudo">{{ PAPEIS[c.pessoa.papel] }}<template v-if="c.pessoa.grupo"> · {{ GRUPOS[c.pessoa.grupo] }}</template> · semana de {{ semanaTexto(c.semana) }}</div>
      </div>
      <div class="total" :class="{ ok: c.minutos >= 480 }">{{ horas(c.minutos) }}<small> / 8h00</small></div>
    </div>

    <div v-if="c.sem_evidencia" class="aviso">{{ c.sem_evidencia }} atividade(s) sem evidência: não podem ser validadas.</div>

    <div class="semana">
      <div v-for="d in dias(c)" :key="d.data" class="dia" :class="{ vazio: !d.lista.length }">
        <label v-if="d.lista.length" class="dia-topo">
          <input type="checkbox" :checked="d.lista.filter((a) => a.evidencias.length).every((a) => marcadas.has(a.id))" @change="alternarDia(d.lista)" />
          <strong>{{ d.rotulo }}</strong> <span>{{ horas(d.minutos) }}</span>
        </label>
        <div v-else class="dia-topo"><strong>{{ d.rotulo }}</strong><span>—</span></div>
      </div>
    </div>

    <button class="link" @click="aberto = aberto === chave(c) ? null : chave(c)">
      {{ aberto === chave(c) ? 'esconder' : 'ver' }} as {{ c.atividades.length }} atividades
    </button>
    <table v-if="aberto === chave(c)" class="tabela detalhe">
      <tbody>
        <tr v-for="a in c.atividades" :key="a.id">
          <td><input type="checkbox" :checked="marcadas.has(a.id)" :disabled="!a.evidencias.length" @change="alternar(a.id)" /></td>
          <td class="quando">{{ new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }) }}<br />{{ a.hora_inicio }}–{{ a.hora_fim }}</td>
          <td>
            <strong>{{ TIPOS_ATIVIDADE[a.tipo] }}</strong> · {{ a.modalidade }}<template v-if="a.territorio"> · {{ a.territorio }}</template>
            <span v-if="a.meta_codigo" class="selo teal">{{ a.meta_codigo }}</span>
            <div>{{ a.descricao }}</div>
            <div class="evs">
              <template v-for="e in a.evidencias" :key="e.id">
                <a v-if="e.tipo === 'arquivo'" :href="`/api/evidencias/${e.id}/arquivo`" target="_blank" rel="noopener">📎 {{ e.nome }}</a>
                <a v-else :href="e.url!" target="_blank" rel="noopener noreferrer">🔗 {{ e.nome }}</a>
              </template>
              <span v-if="!a.evidencias.length" class="selo vermelho">sem evidência</span>
            </div>
          </td>
          <td class="dur">{{ horas(a.minutos) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="acoes">
      <button class="botao" :disabled="!selecionadas(c).length" @click="decidir(c, 'validar')">Validar {{ selecionadas(c).length }} selecionada(s)</button>
      <button class="botao perigo" :disabled="!selecionadas(c).length" @click="decidir(c, 'devolver')">Devolver</button>
    </div>
  </section>
</template>

<style scoped>
.vazio { text-align: center; color: var(--texto-2); }
.pessoa { margin-bottom: 1rem; display: flex; flex-direction: column; gap: .75rem; }
.cabeca { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
.cabeca h2 { margin: 0; }
.total { font-size: 1.5rem; font-weight: 800; color: var(--azul); white-space: nowrap; }
.total.ok { color: var(--verde); }
.total small { font-size: .85rem; color: var(--texto-2); font-weight: 500; }
.semana { display: grid; grid-template-columns: repeat(7, 1fr); gap: .35rem; }
@media (max-width: 640px) { .semana { grid-template-columns: repeat(4, 1fr); } }
.dia { border: 1px solid var(--borda); border-radius: 8px; padding: .45rem .5rem; background: var(--teal-50); }
.dia.vazio { background: #F6F7F5; color: var(--cinza); }
.dia-topo { display: flex; gap: .35rem; align-items: center; font-size: .82rem; cursor: pointer; }
.dia-topo input { width: auto; }
.dia-topo span { margin-left: auto; }
.detalhe td { vertical-align: top; font-size: .88rem; }
.detalhe input { width: auto; }
.quando { white-space: nowrap; color: var(--texto-2); }
.dur { white-space: nowrap; text-align: right; }
.evs { display: flex; flex-wrap: wrap; gap: .2rem .8rem; margin-top: .3rem; font-size: .82rem; }
.acoes { display: flex; gap: .6rem; flex-wrap: wrap; }
.link { background: none; border: 0; color: var(--teal-700); cursor: pointer; font: inherit; font-size: .85rem; text-decoration: underline; padding: 0; align-self: flex-start; }
.miudo { font-size: .8rem; color: var(--texto-2); }
</style>
