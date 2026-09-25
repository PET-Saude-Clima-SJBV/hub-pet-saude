<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../api';
import { carregarSessao } from '../../sessao';

interface Func { chave: string; nome: string; descricao: string; estado: string; atualizado_em: string; atualizado_por: string | null }
const funcs = ref<Func[]>([]);
const erro = ref('');

const ESTADOS = [
  { valor: 'desligada', rotulo: 'Desligada', dica: 'Ninguém usa: a tela some e a API recusa' },
  { valor: 'teste', rotulo: 'Em teste', dica: 'Só administradores e desenvolvedores' },
  { valor: 'ligada', rotulo: 'Ligada', dica: 'Todos que têm permissão pelo papel' },
];

async function carregar() {
  try {
    funcs.value = await api<Func[]>('/admin/funcionalidades');
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
onMounted(carregar);

async function mudar(f: Func, estado: string) {
  if (estado === f.estado) return;
  if (estado === 'desligada' && !confirm(`Desligar "${f.nome}"? Ninguém mais conseguirá usar até ser religada.`)) return;
  erro.value = '';
  try {
    await api(`/admin/funcionalidades/${f.chave}`, { metodo: 'PUT', corpo: { estado } });
    await carregar();
    await carregarSessao(); // atualiza o menu na hora
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
const quando = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
</script>

<template>
  <h1>Funcionalidades</h1>
  <p class="sub">Liga, desliga ou deixa em teste cada parte do sistema, a qualquer momento. Vale só para este ambiente.</p>

  <div class="aviso">
    Se algo estiver errado numa funcionalidade, <strong>desligue</strong>: ninguém consegue mais usá-la e os dados ficam protegidos.
    Funcionalidade nova entra <strong>em teste</strong> e só depois é ligada para todos.
  </div>
  <p v-if="erro" class="erro">{{ erro }}</p>

  <section v-for="f in funcs" :key="f.chave" class="cartao func">
    <div class="info">
      <h2>{{ f.nome }}</h2>
      <p>{{ f.descricao }}</p>
      <div class="miudo">
        chave <code>{{ f.chave }}</code> · alterada em {{ quando(f.atualizado_em) }}<template v-if="f.atualizado_por"> por {{ f.atualizado_por }}</template>
      </div>
    </div>
    <div class="chave" role="radiogroup" :aria-label="f.nome">
      <button v-for="e in ESTADOS" :key="e.valor" :class="[e.valor, { marcado: f.estado === e.valor }]" :title="e.dica"
        role="radio" :aria-checked="f.estado === e.valor" @click="mudar(f, e.valor)">
        {{ e.rotulo }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.aviso { margin-bottom: 1rem; }
.func { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: .75rem; }
.info h2 { margin: 0 0 .2rem; }
.info p { margin: 0 0 .4rem; color: var(--texto-2); font-size: .9rem; }
.miudo { font-size: .78rem; color: var(--texto-2); }
.chave { display: inline-flex; border: 1px solid var(--borda); border-radius: 10px; overflow: hidden; }
.chave button { border: 0; border-right: 1px solid var(--borda); background: #fff; padding: .5rem .95rem; font: inherit; font-size: .85rem; cursor: pointer; color: var(--texto-2); }
.chave button:last-child { border-right: 0; }
.chave .marcado.desligada { background: #FDEDED; color: #B3302F; font-weight: 700; }
.chave .marcado.teste { background: #FDF3E1; color: #8A5A10; font-weight: 700; }
.chave .marcado.ligada { background: #E3F4EE; color: #13714F; font-weight: 700; }
</style>
