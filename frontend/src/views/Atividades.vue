<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api, horas, STATUS, TIPOS_ATIVIDADE, VALIDACAO } from '../api';
import { confirmar } from '../dialogo';

interface Evidencia { id: string; tipo: 'arquivo' | 'link'; nome: string; url: string | null; mime: string | null; tamanho: number | null }
interface Atividade {
  id: string; data: string; hora_inicio: string; hora_fim: string; minutos: number; tipo: string; modalidade: string;
  territorio: string | null; acao_id: number | null; acao_titulo: string | null; meta_codigo: string | null;
  descricao: string; status: string; validacao: string; validador_nome: string | null; motivo_devolucao: string | null;
  evidencias: Evidencia[];
}
interface Acao { id: number; titulo: string; meta_codigo: string }

const hoje = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
const dados = ref<{ atividades: Atividade[]; devolvidas: Atividade[]; semana: { minutos: number; meta: number }; de: string; ate: string } | null>(null);
const acoes = ref<Acao[]>([]);
const erro = ref('');
const aviso = ref('');
const enviando = ref(false);
const editando = ref<string | null>(null);

const vazio = () => ({ data: hoje, hora_inicio: '', hora_fim: '', tipo: '', modalidade: 'presencial', territorio: '',
  acao_id: '' as number | '', descricao: '', status: 'concluido' });
const form = reactive(vazio());
const arquivos = ref<File[]>([]);
const links = ref<{ nome: string; url: string }[]>([]);
const inputArquivo = ref<HTMLInputElement | null>(null);

const minutosForm = computed(() => {
  if (!form.hora_inicio || !form.hora_fim) return 0;
  const [h1, m1] = form.hora_inicio.split(':').map(Number);
  const [h2, m2] = form.hora_fim.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
});
const temEvidencia = computed(() => editando.value || arquivos.value.length > 0 || links.value.some((l) => l.url.trim()));
const porcentoSemana = computed(() => dados.value ? Math.min(100, Math.round(dados.value.semana.minutos / dados.value.semana.meta * 100)) : 0);

// atividades agrupadas por dia, com o total do dia (horas do dia = soma das atividades)
const porDia = computed(() => {
  const m = new Map<string, Atividade[]>();
  for (const a of dados.value?.atividades ?? []) m.set(a.data, [...(m.get(a.data) ?? []), a]);
  return [...m.entries()].map(([data, lista]) => ({ data, lista, minutos: lista.reduce((t, a) => t + a.minutos, 0) }));
});

async function carregar(de?: string) {
  try {
    dados.value = await api(`/atividades/minhas${de ? `?de=${de}` : ''}`);
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
onMounted(async () => {
  await carregar();
  acoes.value = (await api<{ acoes: Acao[] }>('/atividades/opcoes').catch(() => ({ acoes: [] }))).acoes;
});

function adicionarArquivos(ev: Event) {
  const novos = [...((ev.target as HTMLInputElement).files ?? [])];
  arquivos.value = [...arquivos.value, ...novos].slice(0, 5);
  if (inputArquivo.value) inputArquivo.value.value = '';
}

function limpar() {
  Object.assign(form, vazio());
  arquivos.value = [];
  links.value = [];
  editando.value = null;
}

function editar(a: Atividade) {
  Object.assign(form, { data: a.data, hora_inicio: a.hora_inicio, hora_fim: a.hora_fim, tipo: a.tipo, modalidade: a.modalidade,
    territorio: a.territorio ?? '', acao_id: a.acao_id ?? '', descricao: a.descricao, status: a.status });
  editando.value = a.id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function salvar() {
  erro.value = aviso.value = '';
  enviando.value = true;
  try {
    if (editando.value) {
      await api(`/atividades/${editando.value}`, { metodo: 'PUT', corpo: { ...form, acao_id: form.acao_id || null } });
      aviso.value = 'Atividade atualizada.';
    } else {
      const fd = new FormData();
      for (const [k, v] of Object.entries(form)) if (v !== '' && v !== null) fd.append(k, String(v));
      for (const f of arquivos.value) fd.append('arquivos', f);
      fd.append('links', JSON.stringify(links.value.filter((l) => l.url.trim())));
      await api('/atividades', { corpo: fd });
      aviso.value = 'Atividade registrada.';
    }
    limpar();
    await carregar(dados.value?.de);
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    enviando.value = false;
  }
}

async function apagar(a: Atividade) {
  if (!(await confirmar({ titulo: 'Apagar esta atividade?', texto: 'A atividade e as evidências anexadas serão apagadas.', confirmar: 'Apagar', perigo: true }))) return;
  await api(`/atividades/${a.id}`, { metodo: 'DELETE' }).catch((e) => (erro.value = e.message));
  await carregar(dados.value?.de);
}

async function anexar(a: Atividade, ev: Event) {
  const fd = new FormData();
  for (const f of (ev.target as HTMLInputElement).files ?? []) fd.append('arquivos', f);
  try {
    await api(`/atividades/${a.id}/evidencias`, { corpo: fd });
    await carregar(dados.value?.de);
  } catch (e) {
    erro.value = (e as Error).message;
  }
}

async function removerEvidencia(e: Evidencia) {
  if (!(await confirmar({ titulo: 'Remover evidência?', texto: `"${e.nome}" será removida desta atividade.`, confirmar: 'Remover', perigo: true }))) return;
  await api(`/evidencias/${e.id}`, { metodo: 'DELETE' }).catch((x) => (erro.value = x.message));
  await carregar(dados.value?.de);
}

function mudarPeriodo(dias: number) {
  const d = new Date((dados.value?.de ?? hoje) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  carregar(d.toISOString().slice(0, 10));
}
const dataLonga = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const kb = (n: number | null) => n ? `${Math.max(1, Math.round(n / 1024))} KB` : '';
</script>

<template>
  <h1>Minhas atividades</h1>
  <p class="sub">Registre o que você fez, com evidência. As horas do dia são a soma das atividades.</p>

  <p v-if="erro" class="erro">{{ erro }}</p>
  <p v-if="aviso" class="selo verde">{{ aviso }}</p>

  <div v-if="dados?.devolvidas.length" class="aviso devolvidas">
    <strong>{{ dados.devolvidas.length }} atividade(s) devolvida(s) para correção.</strong>
    <div v-for="a in dados.devolvidas" :key="a.id" class="devolvida">
      {{ dataLonga(a.data) }} · {{ TIPOS_ATIVIDADE[a.tipo] }}: <em>{{ a.motivo_devolucao }}</em>
      <button class="link" @click="editar(a)">corrigir</button>
    </div>
  </div>

  <div class="colunas">
    <form class="cartao registro" @submit.prevent="salvar">
      <h2>{{ editando ? 'Editar atividade' : 'Nova atividade' }}</h2>
      <div class="grade tres">
        <label class="campo">Data <input v-model="form.data" type="date" :max="hoje" required /></label>
        <label class="campo">Início <input v-model="form.hora_inicio" type="time" required /></label>
        <label class="campo">Fim <input v-model="form.hora_fim" type="time" required /></label>
      </div>
      <div class="total" :class="{ invalido: form.hora_fim && minutosForm <= 0 }">
        Duração: <strong>{{ minutosForm > 0 ? horas(minutosForm) : '—' }}</strong>
      </div>
      <div class="grade duas">
        <label class="campo">Tipo de atividade
          <select v-model="form.tipo" required>
            <option value="" disabled>Escolha…</option>
            <option v-for="(r, k) in TIPOS_ATIVIDADE" :key="k" :value="k">{{ r }}</option>
          </select>
        </label>
        <div class="campo">Modalidade
          <div class="opcoes">
            <label :class="{ marcado: form.modalidade === 'presencial' }"><input v-model="form.modalidade" type="radio" value="presencial" /> Presencial</label>
            <label :class="{ marcado: form.modalidade === 'remoto' }"><input v-model="form.modalidade" type="radio" value="remoto" /> Remoto</label>
          </div>
        </div>
        <label class="campo">Território / local <input v-model="form.territorio" placeholder="ex.: UBS Centro" /></label>
        <label class="campo">Situação
          <select v-model="form.status"><option v-for="(s, k) in STATUS" :key="k" :value="k">{{ s.rotulo }}</option></select>
        </label>
      </div>
      <label class="campo">Ação / meta relacionada
        <select v-model="form.acao_id">
          <option value="">— nenhuma (atividade geral) —</option>
          <option v-for="a in acoes" :key="a.id" :value="a.id">{{ a.meta_codigo }} · {{ a.titulo }}</option>
        </select>
      </label>
      <label class="campo">O que foi feito <textarea v-model="form.descricao" rows="3" class="texto" required></textarea></label>

      <fieldset v-if="!editando" class="evidencia" :class="{ falta: !temEvidencia }">
        <legend>Evidência <span class="obrigatorio">obrigatória</span></legend>
        <p class="miudo">Foto, PDF (até 5 arquivos de 10 MB) ou link (ata, documento, publicação).</p>
        <input ref="inputArquivo" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" @change="adicionarArquivos" />
        <ul v-if="arquivos.length" class="lista">
          <li v-for="(f, i) in arquivos" :key="i">📎 {{ f.name }} <small>{{ kb(f.size) }}</small>
            <button type="button" class="link perigo" @click="arquivos.splice(i, 1)">tirar</button></li>
        </ul>
        <div v-for="(l, i) in links" :key="'l' + i" class="link-linha">
          <input v-model="l.url" type="url" placeholder="https://…" />
          <input v-model="l.nome" placeholder="descrição (opcional)" />
          <button type="button" class="link perigo" @click="links.splice(i, 1)">tirar</button>
        </div>
        <button type="button" class="link" @click="links.push({ nome: '', url: '' })">+ adicionar link</button>
      </fieldset>
      <p v-else class="miudo">Para mudar as evidências, use os botões na lista abaixo.</p>

      <div class="acoes">
        <button class="botao" :disabled="enviando || !temEvidencia || minutosForm <= 0">
          {{ enviando ? 'Enviando…' : editando ? 'Salvar alterações' : 'Registrar atividade' }}
        </button>
        <button v-if="editando" type="button" class="botao secundario" @click="limpar">Cancelar</button>
      </div>
    </form>

    <aside class="cartao semana">
      <h2>Sua semana</h2>
      <div class="horas-semana">{{ horas(dados?.semana.minutos ?? 0) }} <small>de {{ horas(dados?.semana.meta ?? 480) }}</small></div>
      <div class="barra"><div :style="{ width: porcentoSemana + '%' }" :class="{ cheia: porcentoSemana >= 100 }"></div></div>
      <p class="miudo">O PET exige 8h por semana. Horas contam a partir de segunda-feira.</p>
    </aside>
  </div>

  <section class="historico">
    <div class="titulo-secao">
      <h2>Registradas</h2>
      <div class="periodo">
        <button class="link" @click="mudarPeriodo(-7)">← semana anterior</button>
        <span v-if="dados" class="miudo">desde {{ new Date(dados.de + 'T12:00:00').toLocaleDateString('pt-BR') }}</span>
      </div>
    </div>
    <p v-if="dados && !porDia.length" class="miudo">Nenhuma atividade neste período.</p>
    <div v-for="d in porDia" :key="d.data" class="dia">
      <div class="dia-topo"><strong>{{ dataLonga(d.data) }}</strong><span>{{ horas(d.minutos) }}</span></div>
      <div v-for="a in d.lista" :key="a.id" class="cartao atividade">
        <div class="linha1">
          <span class="hora">{{ a.hora_inicio }}–{{ a.hora_fim }}</span>
          <strong>{{ TIPOS_ATIVIDADE[a.tipo] }}</strong>
          <span class="selo">{{ a.modalidade }}</span>
          <span v-if="a.meta_codigo" class="selo teal">{{ a.meta_codigo }} · {{ a.acao_titulo }}</span>
          <span class="selo" :class="VALIDACAO[a.validacao].cor">{{ VALIDACAO[a.validacao].rotulo }}</span>
        </div>
        <p>{{ a.descricao }}</p>
        <div v-if="a.validacao === 'devolvida'" class="erro">Devolvida: {{ a.motivo_devolucao }}</div>
        <div v-if="a.validacao === 'validada'" class="miudo">Validada por {{ a.validador_nome }}</div>
        <div class="evs">
          <template v-for="e in a.evidencias" :key="e.id">
            <a v-if="e.tipo === 'arquivo'" :href="`/api/evidencias/${e.id}/arquivo`" target="_blank" rel="noopener">📎 {{ e.nome }}</a>
            <a v-else :href="e.url!" target="_blank" rel="noopener noreferrer">🔗 {{ e.nome }}</a>
            <button v-if="a.validacao !== 'validada' && a.evidencias.length > 1" class="link perigo mini" @click="removerEvidencia(e)">×</button>
          </template>
        </div>
        <div v-if="a.validacao !== 'validada'" class="acoes">
          <button class="link" @click="editar(a)">editar</button>
          <label class="link">+ evidência<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" hidden @change="anexar(a, $event)" /></label>
          <button class="link perigo" @click="apagar(a)">apagar</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.colunas { display: grid; gap: 1rem; grid-template-columns: 1fr; align-items: start; }
@media (min-width: 960px) { .colunas { grid-template-columns: 1fr 260px; } }
.registro { display: flex; flex-direction: column; gap: .9rem; }
.registro h2 { margin: 0; }
.grade.tres { display: grid; gap: .75rem; grid-template-columns: 1.3fr 1fr 1fr; }
@media (max-width: 560px) { .grade.tres { grid-template-columns: 1fr 1fr; } .grade.tres > :first-child { grid-column: 1 / -1; } }
.total { font-size: .9rem; color: var(--texto-2); margin-top: -.4rem; }
.total.invalido { color: var(--vermelho); }
.texto { font-family: inherit; font-size: .92rem; }
.opcoes { display: inline-flex; border: 1px solid var(--borda); border-radius: 8px; overflow: hidden; font-weight: 400; }
.opcoes label { padding: .5rem .9rem; cursor: pointer; color: var(--texto); }
.opcoes label + label { border-left: 1px solid var(--borda); }
.opcoes input { display: none; }
.opcoes .marcado { background: var(--teal-50); color: var(--teal-900); font-weight: 600; }
.evidencia { border: 1px dashed var(--teal-700); border-radius: 10px; padding: .8rem 1rem; display: flex; flex-direction: column; gap: .5rem; }
.evidencia.falta { border-color: var(--ambar); background: #FFFBF3; }
.evidencia legend { font-weight: 700; font-size: .9rem; padding: 0 .3rem; }
.obrigatorio { font-size: .72rem; color: #8A5A10; background: #FDF3E1; border-radius: 999px; padding: .05rem .45rem; margin-left: .3rem; }
.lista { list-style: none; margin: 0; padding: 0; font-size: .88rem; }
.link-linha { display: grid; grid-template-columns: 2fr 1.3fr auto; gap: .4rem; }
.acoes { display: flex; gap: .7rem; align-items: center; flex-wrap: wrap; }
.link { background: none; border: 0; color: var(--teal-700); cursor: pointer; font: inherit; font-size: .85rem; text-decoration: underline; padding: 0; }
.link.perigo { color: var(--vermelho); }
.mini { text-decoration: none; font-weight: 700; margin: 0 .5rem 0 -.2rem; }
.miudo { font-size: .8rem; color: var(--texto-2); margin: 0; }
.semana h2 { margin-bottom: .4rem; }
.horas-semana { font-size: 2rem; font-weight: 800; color: var(--teal-900); }
.horas-semana small { font-size: .9rem; color: var(--texto-2); font-weight: 500; }
.barra { height: 10px; background: #EEF0EC; border-radius: 999px; overflow: hidden; margin: .5rem 0 .75rem; }
.barra div { height: 100%; background: var(--azul); }
.barra div.cheia { background: var(--verde); }
.devolvidas { margin-bottom: 1rem; }
.devolvida { font-size: .88rem; margin-top: .3rem; }
.historico { margin-top: 1.5rem; }
.titulo-secao { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
.periodo { display: flex; gap: .8rem; align-items: baseline; }
.dia { margin-bottom: 1rem; }
.dia-topo { display: flex; justify-content: space-between; font-size: .9rem; padding: .3rem .2rem; text-transform: capitalize; }
.atividade { padding: .8rem 1rem; margin-bottom: .5rem; }
.linha1 { display: flex; gap: .45rem; align-items: center; flex-wrap: wrap; font-size: .88rem; }
.hora { font-family: ui-monospace, Consolas, monospace; color: var(--texto-2); }
.atividade p { margin: .4rem 0; font-size: .92rem; }
.evs { display: flex; flex-wrap: wrap; gap: .3rem .8rem; font-size: .85rem; margin-bottom: .4rem; align-items: center; }
</style>
