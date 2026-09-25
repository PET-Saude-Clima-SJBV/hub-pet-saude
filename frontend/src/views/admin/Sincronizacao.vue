<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { api, GRUPOS, PAPEIS } from '../../api';
import AvisoGerenciado from '../../components/AvisoGerenciado.vue';

type Situacao = 'aplicado' | 'pendente' | 'erro' | 'alerta';
interface Item { sistema: string; ambiente: string; acao: string; situacao: Situacao; mensagem?: string | null }
interface Linha { usuario: { id: string; nome: string; papel: string; perfil: string; grupo: number | null; ativo: boolean }; itens: Item[] }
interface Execucao { id: number; pedida_em: string; pedida_por: string; concluida_em: string | null; resultado: string | null; resumo: any }
interface Resposta { modo: string; ultima_execucao: Execucao | null; pedido_pendente: Execucao | null; plano: Linha[] }

const dados = ref<Resposta | null>(null);
const erro = ref('');
const pedindo = ref(false);
const soProblemas = ref(false);
let timer: number | undefined;

async function carregar() {
  try {
    dados.value = await api<Resposta>('/admin/sincronizacao');
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
onMounted(() => {
  carregar();
  timer = window.setInterval(carregar, 15000); // acompanha o sincronizador
});
onUnmounted(() => clearInterval(timer));

async function aplicarAgora() {
  pedindo.value = true;
  try {
    await api('/admin/sincronizacao/aplicar', { metodo: 'POST' });
    await carregar();
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    pedindo.value = false;
  }
}

const totais = computed(() => {
  const itens = (dados.value?.plano ?? []).flatMap((l) => l.itens);
  const n = (s: Situacao) => itens.filter((i) => i.situacao === s).length;
  return { aplicado: n('aplicado'), pendente: n('pendente'), erro: n('erro'), alerta: n('alerta') };
});
const linhas = computed(() => (dados.value?.plano ?? [])
  .filter((l) => l.itens.length)
  .filter((l) => !soProblemas.value || l.itens.some((i) => i.situacao !== 'aplicado')));

const ROTULO: Record<Situacao, string> = { aplicado: 'aplicado', pendente: 'pendente', erro: 'erro', alerta: 'alerta' };
const COR: Record<Situacao, string> = { aplicado: 'verde', pendente: 'azul', erro: 'vermelho', alerta: 'ambar' };
const quando = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
</script>

<template>
  <div class="cabecalho">
    <div>
      <h1>Sincronização</h1>
      <p class="sub">O que foi cadastrado × o que já está valendo no HUB, nos bancos, no servidor e no GitHub.</p>
    </div>
    <button v-if="dados?.modo === 'central'" class="botao" :disabled="pedindo || !!dados?.pedido_pendente" @click="aplicarAgora">
      {{ dados?.pedido_pendente ? 'Aplicando…' : 'Aplicar agora' }}
    </button>
  </div>

  <AvisoGerenciado />
  <p v-if="erro" class="erro">{{ erro }}</p>

  <section v-if="dados" class="cartao resumo">
    <div>
      <div class="rotulo">Última sincronização</div>
      <strong>{{ quando(dados.ultima_execucao?.concluida_em) }}</strong>
      <span v-if="dados.ultima_execucao" class="selo" :class="dados.ultima_execucao.resultado === 'ok' ? 'verde' : 'vermelho'">
        {{ dados.ultima_execucao.resultado }}
      </span>
      <div v-if="dados.ultima_execucao?.resumo?.falhas_gerais?.length" class="erro falhas">
        <div v-for="f in dados.ultima_execucao.resumo.falhas_gerais" :key="f">{{ f }}</div>
      </div>
      <div v-if="!dados.ultima_execucao" class="miudo">O sincronizador ainda não rodou. Ele roda sozinho a cada 10 minutos.</div>
    </div>
    <div class="totais">
      <span class="selo verde">{{ totais.aplicado }} aplicados</span>
      <span class="selo azul">{{ totais.pendente }} pendentes</span>
      <span class="selo vermelho">{{ totais.erro }} erros</span>
      <span class="selo ambar">{{ totais.alerta }} alertas</span>
    </div>
  </section>

  <label class="check"><input v-model="soProblemas" type="checkbox" /> mostrar só quem tem pendência, erro ou alerta</label>

  <section v-for="l in linhas" :key="l.usuario.id" class="cartao pessoa">
    <h2>
      <RouterLink :to="`/admin/pessoas/${l.usuario.id}`">{{ l.usuario.nome }}</RouterLink>
      <small>{{ PAPEIS[l.usuario.papel] }} · {{ l.usuario.grupo ? GRUPOS[l.usuario.grupo] : 'sem grupo' }}</small>
      <span v-if="!l.usuario.ativo" class="selo vermelho">inativo</span>
    </h2>
    <table class="tabela">
      <tbody>
        <tr v-for="(i, n) in l.itens" :key="n">
          <td class="sit"><span class="selo" :class="COR[i.situacao]">{{ ROTULO[i.situacao] }}</span></td>
          <td class="sis"><strong>{{ i.sistema }}</strong><span v-if="i.ambiente !== '-'"> · {{ i.ambiente }}</span></td>
          <td>{{ i.acao }}<div v-if="i.mensagem" class="miudo">{{ i.mensagem }}</div></td>
        </tr>
      </tbody>
    </table>
  </section>
  <p v-if="dados && !linhas.length" class="miudo">Nada para mostrar.</p>
</template>

<style scoped>
.cabecalho { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.resumo { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.rotulo { font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; color: var(--texto-2); }
.resumo .selo { margin-left: .4rem; }
.falhas { margin-top: .5rem; font-size: .85rem; }
.totais { display: flex; gap: .4rem; flex-wrap: wrap; }
.check { display: flex; gap: .5rem; align-items: center; font-size: .88rem; margin-bottom: .75rem; color: var(--texto-2); }
.check input { width: auto; }
.pessoa { margin-bottom: .75rem; }
.pessoa h2 { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.pessoa h2 a { text-decoration: none; }
.pessoa small { color: var(--texto-2); font-weight: 400; font-size: .85rem; }
.sit { width: 90px; }
.sis { width: 130px; white-space: nowrap; }
.miudo { font-size: .8rem; color: var(--texto-2); }
</style>
