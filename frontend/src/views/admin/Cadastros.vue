<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../../api';
import { confirmar } from '../../dialogo';
import { carregarCatalogos } from '../../catalogos';

interface Catalogo { chave: string; nome: string; descricao: string; pai: string | null; total: number; ativos: number }
interface Item {
  catalogo: string; codigo: string; nome: string; sigla: string | null; descricao: string | null; pai_codigo: string | null;
  ativo: boolean; ordem: number; sistema: boolean; uso: number;
}
interface Relatorio {
  aplicado: boolean; linhas: number; iguais: number;
  criar: (Item & { linha: number })[]; atualizar: (Item & { linha: number; antes: string })[]; erros: { linha: number; mensagem: string }[];
}

const rota = useRoute();
const router = useRouter();
const catalogos = ref<Catalogo[]>([]);
const chave = ref<string>((rota.query.c as string) || '');
const dados = ref<{ catalogo: Catalogo; itens: Item[]; pais: { codigo: string; nome: string; sigla: string | null }[] } | null>(null);
const busca = ref('');
const filtroPai = ref('');
const mostrarInativos = ref(true);
const erro = ref('');
const aviso = ref('');

const editando = ref<string | null>(null);      // código do item em edição ('novo' para criar)
const form = reactive({ codigo: '', nome: '', sigla: '', descricao: '', pai_codigo: '', ordem: 0 });

async function carregarLista() {
  catalogos.value = await api<Catalogo[]>('/admin/catalogos');
  if (!chave.value && catalogos.value.length) chave.value = catalogos.value[0].chave;
}
async function carregarItens() {
  if (!chave.value) return;
  erro.value = '';
  dados.value = await api(`/admin/catalogos/${chave.value}`);
}
onMounted(async () => {
  try { await carregarLista(); await carregarItens(); } catch (e) { erro.value = (e as Error).message; }
});
watch(chave, async (c) => {
  router.replace({ query: { c } });
  editando.value = null; relatorio.value = null; arquivo.value = null; busca.value = ''; filtroPai.value = '';
  await carregarItens();
});

const visiveis = computed(() => {
  const b = busca.value.trim().toLowerCase();
  return (dados.value?.itens ?? [])
    .filter((i) => mostrarInativos.value || i.ativo)
    .filter((i) => !filtroPai.value || i.pai_codigo === filtroPai.value)
    .filter((i) => !b || `${i.nome} ${i.codigo} ${i.sigla ?? ''}`.toLowerCase().includes(b));
});
const nomePai = (codigo: string | null) => dados.value?.pais.find((p) => p.codigo === codigo)?.sigla
  ?? dados.value?.pais.find((p) => p.codigo === codigo)?.nome ?? codigo ?? '-';

async function depois(msg: string) {
  aviso.value = msg;
  editando.value = null;
  await Promise.all([carregarItens(), carregarLista(), carregarCatalogos(true)]);
}
function abrir(i: Item | null) {
  Object.assign(form, i
    ? { codigo: i.codigo, nome: i.nome, sigla: i.sigla ?? '', descricao: i.descricao ?? '', pai_codigo: i.pai_codigo ?? '', ordem: i.ordem }
    : { codigo: '', nome: '', sigla: '', descricao: '', pai_codigo: filtroPai.value, ordem: (dados.value?.itens.length ?? 0) + 1 });
  editando.value = i ? i.codigo : 'novo';
  erro.value = aviso.value = '';
}
async function salvar() {
  erro.value = '';
  try {
    if (editando.value === 'novo') {
      await api(`/admin/catalogos/${chave.value}`, { corpo: form });
      await depois(`"${form.nome}" cadastrado.`);
    } else {
      await api(`/admin/catalogos/${chave.value}/${editando.value}`, { metodo: 'PUT', corpo: form });
      await depois(`"${form.nome}" atualizado.`);
    }
  } catch (e) { erro.value = (e as Error).message; }
}
async function alternarAtivo(i: Item) {
  if (i.ativo && !(await confirmar({
    titulo: `Inativar "${i.nome}"?`,
    texto: i.uso ? `Está em uso em ${i.uso} registro(s), que continuam intactos. O item só deixa de aparecer nos formulários.` : 'O item deixa de aparecer nos formulários. Pode ser reativado depois.',
    confirmar: 'Inativar',
  }))) return;
  try {
    await api(`/admin/catalogos/${chave.value}/${i.codigo}`, { metodo: 'PUT', corpo: { ativo: !i.ativo } });
    await depois(`"${i.nome}" ${i.ativo ? 'inativado' : 'reativado'}.`);
  } catch (e) { erro.value = (e as Error).message; }
}
async function apagar(i: Item) {
  if (!(await confirmar({ titulo: `Apagar "${i.nome}"?`, texto: 'O item será removido do cadastro.', confirmar: 'Apagar', perigo: true }))) return;
  try {
    await api(`/admin/catalogos/${chave.value}/${i.codigo}`, { metodo: 'DELETE' });
    await depois(`"${i.nome}" apagado.`);
  } catch (e) { erro.value = (e as Error).message; }
}

// ---- importação
const arquivo = ref<File | null>(null);
const relatorio = ref<Relatorio | null>(null);
const importando = ref(false);
const inputArquivo = ref<HTMLInputElement | null>(null);
function escolher(ev: Event) {
  arquivo.value = (ev.target as HTMLInputElement).files?.[0] ?? null;
  relatorio.value = null;
  if (arquivo.value) enviar(true);
}
async function enviar(simular: boolean) {
  if (!arquivo.value) return;
  importando.value = true;
  erro.value = aviso.value = '';
  try {
    const fd = new FormData();
    fd.append('arquivo', arquivo.value);
    relatorio.value = await api<Relatorio>(`/admin/catalogos/${chave.value}/importar?simular=${simular ? 1 : 0}`, { corpo: fd });
    if (!simular) {
      await depois(`Importação concluída: ${relatorio.value.criar.length} criado(s), ${relatorio.value.atualizar.length} atualizado(s).`);
      arquivo.value = null; relatorio.value = null;
      if (inputArquivo.value) inputArquivo.value.value = '';
    }
  } catch (e) { erro.value = (e as Error).message; relatorio.value = null; }
  finally { importando.value = false; }
}
</script>

<template>
  <h1>Cadastros</h1>
  <p class="sub">Listas usadas nos formulários do HUB. Cadastre, renomeie, inative ou importe de uma planilha.</p>
  <p v-if="erro" class="erro">{{ erro }}</p>
  <p v-if="aviso" class="selo verde">{{ aviso }}</p>

  <div class="colunas">
    <nav class="cartao lista-cadastros" aria-label="Cadastros">
      <button v-for="c in catalogos" :key="c.chave" :class="{ ativo: c.chave === chave }" @click="chave = c.chave">
        <strong>{{ c.nome }}</strong>
        <small>{{ c.ativos }} ativos<template v-if="c.total !== c.ativos"> de {{ c.total }}</template></small>
      </button>
    </nav>

    <section v-if="dados" class="principal">
      <div class="cartao">
        <div class="cabeca">
          <div>
            <h2>{{ dados.catalogo.nome }}</h2>
            <p class="miudo">{{ dados.catalogo.descricao }}</p>
          </div>
          <button class="botao" @click="abrir(null)">+ Novo item</button>
        </div>

        <div class="filtros">
          <input v-model="busca" placeholder="Buscar..." />
          <select v-if="dados.pais.length" v-model="filtroPai">
            <option value="">Todas as instituições</option>
            <option v-for="p in dados.pais" :key="p.codigo" :value="p.codigo">{{ p.sigla ?? p.nome }}</option>
          </select>
          <label class="check"><input v-model="mostrarInativos" type="checkbox" /> mostrar inativos</label>
        </div>

        <form v-if="editando" class="formulario" @submit.prevent="salvar">
          <strong>{{ editando === 'novo' ? 'Novo item' : `Editar "${form.nome}"` }}</strong>
          <div class="grade-form">
            <label class="campo">Nome <input v-model="form.nome" required /></label>
            <label class="campo">Sigla ou nome curto <input v-model="form.sigla" /></label>
            <label v-if="dados.pais.length" class="campo">Instituição
              <select v-model="form.pai_codigo">
                <option value="">Nenhuma</option>
                <option v-for="p in dados.pais" :key="p.codigo" :value="p.codigo">{{ p.sigla ?? p.nome }}</option>
              </select>
            </label>
            <label class="campo">Ordem <input v-model.number="form.ordem" type="number" /></label>
            <label v-if="editando === 'novo'" class="campo">Código (opcional)
              <input v-model="form.codigo" placeholder="gerado a partir do nome" pattern="[a-z0-9][a-z0-9_-]*" />
            </label>
            <label class="campo inteiro">Descrição <input v-model="form.descricao" /></label>
          </div>
          <div class="acoes">
            <button class="botao">Salvar</button>
            <button type="button" class="botao secundario" @click="editando = null">Cancelar</button>
          </div>
        </form>

        <div class="rolagem">
          <table class="tabela">
            <thead><tr><th>Nome</th><th v-if="dados.pais.length">Instituição</th><th>Código</th><th>Uso</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              <tr v-for="i in visiveis" :key="i.codigo" :class="{ inativo: !i.ativo }">
                <td><strong>{{ i.nome }}</strong><span v-if="i.sigla" class="selo">{{ i.sigla }}</span>
                  <div v-if="i.descricao" class="miudo">{{ i.descricao }}</div></td>
                <td v-if="dados.pais.length">{{ nomePai(i.pai_codigo) }}</td>
                <td><code>{{ i.codigo }}</code><span v-if="i.sistema" class="selo" title="Item padrão: pode ser renomeado ou inativado, não apagado">padrão</span></td>
                <td>{{ i.uso }}</td>
                <td><span class="selo" :class="i.ativo ? 'verde' : ''">{{ i.ativo ? 'ativo' : 'inativo' }}</span></td>
                <td class="acoes-linha">
                  <button class="link" @click="abrir(i)">editar</button>
                  <button class="link" @click="alternarAtivo(i)">{{ i.ativo ? 'inativar' : 'reativar' }}</button>
                  <button v-if="!i.sistema && !i.uso" class="link perigo" @click="apagar(i)">apagar</button>
                </td>
              </tr>
              <tr v-if="!visiveis.length"><td colspan="6" class="miudo">Nenhum item.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="cartao importar">
        <h2>Importar de arquivo</h2>
        <p class="miudo">
          Baixe o modelo, preencha e envie. Itens com o mesmo código (ou, sem código, o mesmo nome) são atualizados; os demais são criados.
          Nada é gravado antes da sua confirmação.
        </p>
        <div class="modelos">
          <span>Modelo:</span>
          <a class="botao secundario pequeno" :href="`/api/admin/catalogos/${chave}/modelo?formato=xlsx`">XLSX</a>
          <a class="botao secundario pequeno" :href="`/api/admin/catalogos/${chave}/modelo?formato=csv`">CSV</a>
          <a class="botao secundario pequeno" :href="`/api/admin/catalogos/${chave}/modelo?formato=txt`">TXT</a>
        </div>
        <input ref="inputArquivo" type="file" accept=".xlsx,.csv,.txt" @change="escolher" />

        <div v-if="importando" class="miudo">Conferindo o arquivo...</div>
        <div v-if="relatorio && !relatorio.aplicado" class="relatorio">
          <div class="totais">
            <span class="selo verde">{{ relatorio.criar.length }} novos</span>
            <span class="selo azul">{{ relatorio.atualizar.length }} atualizados</span>
            <span class="selo">{{ relatorio.iguais }} sem mudança</span>
            <span class="selo" :class="relatorio.erros.length ? 'vermelho' : ''">{{ relatorio.erros.length }} erros</span>
          </div>
          <ul v-if="relatorio.erros.length" class="erros">
            <li v-for="e in relatorio.erros" :key="e.linha">Linha {{ e.linha }}: {{ e.mensagem }}</li>
          </ul>
          <ul v-if="relatorio.criar.length || relatorio.atualizar.length" class="mudancas">
            <li v-for="i in relatorio.criar" :key="'c' + i.codigo"><span class="selo verde">novo</span> {{ i.nome }} <code>{{ i.codigo }}</code></li>
            <li v-for="i in relatorio.atualizar" :key="'a' + i.codigo"><span class="selo azul">atualiza</span> {{ i.antes }}<template v-if="i.antes !== i.nome"> para {{ i.nome }}</template> <code>{{ i.codigo }}</code></li>
          </ul>
          <div class="acoes">
            <button class="botao" :disabled="!!relatorio.erros.length || (!relatorio.criar.length && !relatorio.atualizar.length) || importando" @click="enviar(false)">
              Confirmar importação
            </button>
            <span v-if="relatorio.erros.length" class="miudo">Corrija os erros no arquivo e envie de novo.</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.colunas { display: grid; gap: 1rem; grid-template-columns: 230px 1fr; align-items: start; }
@media (max-width: 860px) { .colunas { grid-template-columns: 1fr; } }
.lista-cadastros { padding: .5rem; display: flex; flex-direction: column; gap: .2rem; }
.lista-cadastros button { text-align: left; background: none; border: 0; border-radius: 8px; padding: .55rem .7rem; cursor: pointer; font: inherit; display: flex; flex-direction: column; color: var(--texto); }
.lista-cadastros button:hover { background: #F3F4F1; }
.lista-cadastros button.ativo { background: var(--teal-50); box-shadow: inset 3px 0 0 var(--teal-700); }
.lista-cadastros small { color: var(--texto-2); font-size: .76rem; }
.principal { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
.cabeca { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.cabeca h2 { margin: 0; }
.filtros { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin: .9rem 0; }
.filtros input { max-width: 260px; }
.filtros select { max-width: 220px; }
.check { display: flex; gap: .4rem; align-items: center; font-size: .85rem; color: var(--texto-2); }
.check input { width: auto; }
.formulario { background: #F8F9F6; border: 1px solid var(--borda); border-radius: 10px; padding: 1rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: .75rem; }
.grade-form { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.inteiro { grid-column: 1 / -1; }
.acoes { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
.acoes-linha { white-space: nowrap; }
.link { background: none; border: 0; color: var(--teal-700); cursor: pointer; font: inherit; font-size: .85rem; text-decoration: underline; padding: 0; margin-right: .6rem; }
.link.perigo { color: var(--vermelho); }
.inativo { opacity: .55; }
.selo { margin-left: .35rem; }
.miudo { font-size: .8rem; color: var(--texto-2); margin: .2rem 0 0; }
.importar { display: flex; flex-direction: column; gap: .7rem; }
.importar h2 { margin: 0; }
.modelos { display: flex; gap: .4rem; align-items: center; font-size: .85rem; }
.pequeno { padding: .3rem .7rem; font-size: .8rem; }
.relatorio { border-top: 1px solid var(--borda); padding-top: .75rem; display: flex; flex-direction: column; gap: .6rem; }
.totais { display: flex; gap: .3rem; flex-wrap: wrap; }
.totais .selo { margin: 0; }
.erros { margin: 0; padding-left: 1.2rem; color: #B3302F; font-size: .85rem; }
.mudancas { margin: 0; padding: 0; list-style: none; font-size: .85rem; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: .25rem; }
</style>
