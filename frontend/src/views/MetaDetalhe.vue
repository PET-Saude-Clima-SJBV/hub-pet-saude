<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { api, EIXOS, GRUPOS, STATUS } from '../api';
import { sessao } from '../sessao';
import { confirmar } from '../dialogo';

const rota = useRoute();
const id = computed(() => Number(rota.params.id));
const m = ref<any>(null);
const erro = ref('');
const aviso = ref('');
const responsaveis = ref<{ id: string; nome: string; papel: string }[]>([]);

const PERIODICIDADES = ['semanal', 'mensal', 'trimestral', 'semestral', 'anual', 'unica'];

async function carregar() {
  erro.value = '';
  try {
    m.value = await api(`/metas/${id.value}`);
    if (m.value.pode.criar_acoes && !responsaveis.value.length)
      responsaveis.value = await api(`/metas/${id.value}/responsaveis`).catch(() => []);
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
onMounted(carregar);

async function executar(fn: () => Promise<unknown>, ok: string) {
  erro.value = aviso.value = '';
  try {
    await fn();
    aviso.value = ok;
    await carregar();
  } catch (e) {
    erro.value = (e as Error).message;
  }
}

// ---- meta
const editandoMeta = ref(false);
const formMeta = reactive<any>({});
function abrirMeta() {
  Object.assign(formMeta, { status: m.value.status, responsaveis: m.value.responsaveis, parceiros: m.value.parceiros,
    prazo_inicio: m.value.prazo_inicio, prazo_fim: m.value.prazo_fim });
  editandoMeta.value = true;
}
const salvarMeta = () => executar(async () => {
  await api(`/metas/${id.value}`, { metodo: 'PUT', corpo: formMeta });
  editandoMeta.value = false;
}, 'Meta atualizada.');

// ---- indicadores
const indicadorAberto = ref<number | 'novo' | null>(null);
const formInd = reactive<any>({});
function abrirIndicador(i: any | null) {
  Object.assign(formInd, i ?? { nome: '', formula_numerador: '', formula_denominador: '', unidade: '', linha_base: null,
    valor_alvo: null, fonte: '', periodicidade: '', responsavel: '', observacoes: '' });
  indicadorAberto.value = i ? i.id : 'novo';
}
const salvarIndicador = () => executar(async () => {
  if (indicadorAberto.value === 'novo') await api(`/metas/${id.value}/indicadores`, { corpo: formInd });
  else await api(`/indicadores/${indicadorAberto.value}`, { metodo: 'PUT', corpo: formInd });
  indicadorAberto.value = null;
}, 'Ficha do indicador salva.');
const apagarIndicador = async (i: any) => await confirmar({ titulo: 'Remover indicador?', texto: `"${i.nome}" e a ficha dele serão removidos.`, confirmar: 'Remover', perigo: true }) &&
  executar(() => api(`/indicadores/${i.id}`, { metodo: 'DELETE' }), 'Indicador removido.');

// ---- ações
const acaoAberta = ref<number | 'nova' | null>(null);
const formAcao = reactive<any>({});
function abrirAcao(a: any | null) {
  Object.assign(formAcao, a
    ? { ...a, prazo: a.prazo?.slice(0, 10) ?? '' }
    : { titulo: '', descricao: '', territorio: '', responsavel_id: null, prazo: '', status: 'nao_iniciado' });
  acaoAberta.value = a ? a.id : 'nova';
}
const salvarAcao = () => executar(async () => {
  if (acaoAberta.value === 'nova') await api(`/metas/${id.value}/acoes`, { corpo: formAcao });
  else await api(`/acoes/${acaoAberta.value}`, { metodo: 'PUT', corpo: formAcao });
  acaoAberta.value = null;
}, 'Ação salva.');
const apagarAcao = async (a: any) => await confirmar({ titulo: 'Remover ação?', texto: `"${a.titulo}" será removida. Atividades ligadas a ela ficam sem ação relacionada.`, confirmar: 'Remover', perigo: true }) &&
  executar(() => api(`/acoes/${a.id}`, { metodo: 'DELETE' }), 'Ação removida.');
const podeEditarAcao = (a: any) => {
  const e = m.value?.pode.editar_acoes_escopo;
  if (e === 'todos' || sessao.eu?.admin_sistema) return true;
  if (e === 'grupo') return m.value.grupo === sessao.eu?.grupo;
  if (e === 'proprio') return a.criado_por === sessao.eu?.id || a.responsavel_id === sessao.eu?.id;
  return false;
};
const data = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';
</script>

<template>
  <RouterLink to="/metas" class="voltar">← Metas</RouterLink>
  <p v-if="erro" class="erro">{{ erro }}</p>

  <template v-if="m">
    <div class="cabeca">
      <div class="selos">
        <span class="codigo">{{ m.codigo }}</span>
        <span class="selo teal">{{ GRUPOS[m.grupo] }}</span>
        <span class="selo">{{ EIXOS[m.eixo] }}</span>
        <span class="selo" :class="STATUS[m.status].cor">{{ STATUS[m.status].rotulo }}</span>
      </div>
      <h1>{{ m.titulo }}</h1>
    </div>
    <p v-if="aviso" class="selo verde">{{ aviso }}</p>

    <!-- META -->
    <section class="cartao">
      <div class="titulo-secao">
        <h2>Sobre a meta</h2>
        <button v-if="m.pode.editar_meta && !editandoMeta" class="botao secundario pequeno" @click="abrirMeta">Editar</button>
      </div>
      <dl v-if="!editandoMeta" class="dados">
        <dt>Ações sugeridas (edital)</dt><dd>{{ m.acoes_sugeridas ?? '—' }}</dd>
        <dt>Prazo</dt><dd>{{ m.prazo_inicio != null ? `do mês ${m.prazo_inicio} ao mês ${m.prazo_fim}` : '—' }}</dd>
        <dt>Responsáveis</dt><dd>{{ m.responsaveis ?? '—' }}</dd>
        <dt>Parceiros</dt><dd>{{ m.parceiros ?? '—' }}</dd>
      </dl>
      <form v-else class="grade duas" @submit.prevent="salvarMeta">
        <label class="campo">Situação
          <select v-model="formMeta.status"><option v-for="(s, k) in STATUS" :key="k" :value="k">{{ s.rotulo }}</option></select>
        </label>
        <div class="grade duas">
          <label class="campo">Mês inicial <input v-model.number="formMeta.prazo_inicio" type="number" min="0" max="24" /></label>
          <label class="campo">Mês final <input v-model.number="formMeta.prazo_fim" type="number" min="0" max="24" /></label>
        </div>
        <label class="campo inteiro">Responsáveis <input v-model="formMeta.responsaveis" /></label>
        <label class="campo inteiro">Parceiros <textarea v-model="formMeta.parceiros" rows="2" class="texto"></textarea></label>
        <div class="acoes inteiro">
          <button class="botao">Salvar</button>
          <button type="button" class="botao secundario" @click="editandoMeta = false">Cancelar</button>
        </div>
      </form>
    </section>

    <!-- INDICADORES -->
    <section class="cartao">
      <div class="titulo-secao">
        <h2>Indicadores</h2>
        <button v-if="m.pode.editar_indicadores" class="botao secundario pequeno" @click="abrirIndicador(null)">+ Indicador</button>
      </div>
      <p class="dica">Pelo Guia, a ficha precisa estar completa <strong>antes</strong> da coleta: fórmula, linha de base, fonte, periodicidade e responsável.</p>

      <div v-for="i in m.indicadores" :key="i.id" class="indicador">
        <div class="linha-ind">
          <div>
            <strong>{{ i.nome }}</strong>
            <span v-if="i.oficial" class="selo">oficial</span>
            <span class="selo" :class="i.ficha_preenchida === i.ficha_total ? 'verde' : 'ambar'">ficha {{ i.ficha_preenchida }}/{{ i.ficha_total }}</span>
          </div>
          <div v-if="m.pode.editar_indicadores" class="acoes">
            <button class="link" @click="abrirIndicador(i)">editar ficha</button>
            <button v-if="!i.oficial" class="link perigo" @click="apagarIndicador(i)">remover</button>
          </div>
        </div>
        <dl v-if="indicadorAberto !== i.id" class="dados mini">
          <dt>Fórmula</dt><dd>{{ i.formula_numerador ?? '—' }}<template v-if="i.formula_denominador"> ÷ {{ i.formula_denominador }}</template></dd>
          <dt>Linha de base → alvo</dt><dd>{{ i.linha_base ?? '—' }} → {{ i.valor_alvo ?? '—' }} {{ i.unidade ?? '' }}</dd>
          <dt>Fonte · periodicidade</dt><dd>{{ i.fonte ?? '—' }} · {{ i.periodicidade ?? '—' }}</dd>
          <dt>Responsável</dt><dd>{{ i.responsavel ?? '—' }}</dd>
        </dl>
        <form v-if="indicadorAberto === i.id" class="grade duas ficha" @submit.prevent="salvarIndicador">
          <template v-if="!i.oficial"><label class="campo inteiro">Nome <input v-model="formInd.nome" required /></label></template>
          <label class="campo">Numerador (o que se conta) <input v-model="formInd.formula_numerador" /></label>
          <label class="campo">Denominador (sobre o quê) <input v-model="formInd.formula_denominador" placeholder="vazio se for contagem" /></label>
          <label class="campo">Linha de base <input v-model="formInd.linha_base" type="number" step="any" /></label>
          <label class="campo">Valor alvo <input v-model="formInd.valor_alvo" type="number" step="any" /></label>
          <label class="campo">Unidade <input v-model="formInd.unidade" placeholder="%, nº, dias…" /></label>
          <label class="campo">Periodicidade
            <select v-model="formInd.periodicidade"><option value="">—</option><option v-for="p in PERIODICIDADES" :key="p" :value="p">{{ p }}</option></select>
          </label>
          <label class="campo">Fonte do dado <input v-model="formInd.fonte" placeholder="ex.: e-SUS APS, SINAN" /></label>
          <label class="campo">Responsável pela coleta <input v-model="formInd.responsavel" /></label>
          <label class="campo inteiro">Observações <textarea v-model="formInd.observacoes" rows="2" class="texto"></textarea></label>
          <div class="acoes inteiro">
            <button class="botao">Salvar ficha</button>
            <button type="button" class="botao secundario" @click="indicadorAberto = null">Cancelar</button>
          </div>
        </form>
      </div>

      <form v-if="indicadorAberto === 'novo'" class="grade duas ficha" @submit.prevent="salvarIndicador">
        <label class="campo inteiro">Nome do novo indicador <input v-model="formInd.nome" required /></label>
        <label class="campo">Numerador <input v-model="formInd.formula_numerador" /></label>
        <label class="campo">Denominador <input v-model="formInd.formula_denominador" /></label>
        <div class="acoes inteiro">
          <button class="botao">Criar</button>
          <button type="button" class="botao secundario" @click="indicadorAberto = null">Cancelar</button>
        </div>
      </form>
    </section>

    <!-- AÇÕES -->
    <section v-if="m.pode.ver_acoes" class="cartao">
      <div class="titulo-secao">
        <h2>Ações <small>{{ m.acoes.length }}</small></h2>
        <button v-if="m.pode.criar_acoes" class="botao secundario pequeno" @click="abrirAcao(null)">+ Ação</button>
      </div>

      <form v-if="acaoAberta !== null" class="grade duas ficha" @submit.prevent="salvarAcao">
        <label class="campo inteiro">Título <input v-model="formAcao.titulo" required /></label>
        <label class="campo inteiro">Descrição <textarea v-model="formAcao.descricao" rows="2" class="texto"></textarea></label>
        <label class="campo">Território / local <input v-model="formAcao.territorio" /></label>
        <label class="campo">Responsável
          <select v-model="formAcao.responsavel_id">
            <option :value="null">—</option>
            <option v-for="r in responsaveis" :key="r.id" :value="r.id">{{ r.nome }}</option>
          </select>
        </label>
        <label class="campo">Prazo <input v-model="formAcao.prazo" type="date" /></label>
        <label class="campo">Situação
          <select v-model="formAcao.status"><option v-for="(s, k) in STATUS" :key="k" :value="k">{{ s.rotulo }}</option></select>
        </label>
        <div class="acoes inteiro">
          <button class="botao">{{ acaoAberta === 'nova' ? 'Criar ação' : 'Salvar' }}</button>
          <button type="button" class="botao secundario" @click="acaoAberta = null">Cancelar</button>
        </div>
      </form>

      <table v-if="m.acoes.length" class="tabela">
        <thead><tr><th>Ação</th><th>Território</th><th>Responsável</th><th>Prazo</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          <tr v-for="a in m.acoes" :key="a.id">
            <td><strong>{{ a.titulo }}</strong><div v-if="a.descricao" class="miudo">{{ a.descricao }}</div></td>
            <td>{{ a.territorio ?? '—' }}</td>
            <td>{{ a.responsavel_nome ?? '—' }}</td>
            <td>{{ data(a.prazo) }}</td>
            <td><span class="selo" :class="STATUS[a.status].cor">{{ STATUS[a.status].rotulo }}</span></td>
            <td class="acoes">
              <template v-if="podeEditarAcao(a)">
                <button class="link" @click="abrirAcao(a)">editar</button>
                <button class="link perigo" @click="apagarAcao(a)">remover</button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="acaoAberta === null" class="dica">Nenhuma ação cadastrada para esta meta ainda.</p>
    </section>
  </template>
</template>

<style scoped>
.voltar { font-size: .85rem; text-decoration: none; }
.cabeca { margin: .5rem 0 1rem; }
.selos { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; }
.codigo { font-weight: 800; color: var(--teal-900); font-family: ui-monospace, Consolas, monospace; }
h1 { margin-top: .5rem; font-size: 1.35rem; }
section.cartao { margin-bottom: 1rem; }
.titulo-secao { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
.titulo-secao h2 small { color: var(--texto-2); font-weight: 400; }
.pequeno { padding: .3rem .7rem; font-size: .8rem; }
.dados { display: grid; grid-template-columns: 200px 1fr; gap: .45rem 1rem; margin: 0; font-size: .9rem; }
.dados dt { color: var(--texto-2); font-weight: 600; }
.dados dd { margin: 0; }
.dados.mini { grid-template-columns: 170px 1fr; font-size: .85rem; margin-top: .6rem; }
@media (max-width: 640px) { .dados, .dados.mini { grid-template-columns: 1fr; } .dados dd { margin-bottom: .4rem; } }
.dica { font-size: .85rem; color: var(--texto-2); margin: .25rem 0 1rem; }
.indicador { border-top: 1px solid var(--borda); padding: .9rem 0; }
.linha-ind { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.linha-ind .selo { margin-left: .4rem; }
.ficha { background: #F8F9F6; border: 1px solid var(--borda); border-radius: 10px; padding: 1rem; margin: .75rem 0; }
.inteiro { grid-column: 1 / -1; }
.texto { font-family: inherit; font-size: .9rem; }
.acoes { display: flex; gap: .6rem; flex-wrap: wrap; align-items: center; }
.link { background: none; border: 0; color: var(--teal-700); cursor: pointer; font: inherit; font-size: .85rem; text-decoration: underline; padding: 0; }
.link.perigo { color: var(--vermelho); }
.miudo { font-size: .8rem; color: var(--texto-2); }
</style>
