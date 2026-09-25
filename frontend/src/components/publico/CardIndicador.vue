<script setup lang="ts">
import { ref } from 'vue';

/** Card de número da página externa. Clicar abre a explicação do que o número significa. */
const props = defineProps<{
  titulo: string; valor: number; unidade?: string | null; descricao: string;
  detalhe?: string | null; fonte?: string | null; ficticio?: boolean;
}>();
const aberto = ref(false);
const id = `detalhe-${Math.random().toString(36).slice(2, 9)}`;
</script>

<template>
  <article class="cartao kpi" :class="{ aberto }">
    <button type="button" class="topo" :aria-expanded="aberto" :aria-controls="id" :disabled="!props.detalhe" @click="aberto = !aberto">
      <span class="valor">{{ props.valor.toLocaleString('pt-BR') }}<small v-if="props.unidade"> {{ props.unidade }}</small></span>
      <span class="titulo">{{ props.titulo }}</span>
      <span class="descricao">{{ props.descricao }}</span>
      <span class="rodape">
        <span v-if="props.ficticio" class="selo ambar">dado ilustrativo</span>
        <span v-if="props.detalhe" class="abrir">{{ aberto ? 'Fechar' : 'O que é este número?' }} <i class="seta" :class="{ girada: aberto }">›</i></span>
      </span>
    </button>
    <div v-show="aberto" :id="id" class="detalhe">
      <p>{{ props.detalhe }}</p>
      <p v-if="props.fonte" class="fonte"><strong>Fonte:</strong> {{ props.fonte }}</p>
    </div>
  </article>
</template>

<style scoped>
.kpi { padding: 0; overflow: hidden; align-self: start; }
.topo { width: 100%; text-align: left; background: none; border: 0; padding: 1.25rem; font: inherit; color: inherit; cursor: pointer;
  display: flex; flex-direction: column; gap: .15rem; }
.topo:disabled { cursor: default; }
.topo:not(:disabled):hover .abrir { text-decoration: underline; }
.topo:focus-visible { outline: 2px solid var(--teal-700); outline-offset: -2px; }
.valor { font-size: 2.2rem; font-weight: 800; color: var(--teal-900); }
.titulo { font-weight: 700; }
.descricao { color: var(--texto-2); font-size: .88rem; margin: .2rem 0 .5rem; }
.rodape { display: flex; justify-content: space-between; align-items: center; gap: .5rem; flex-wrap: wrap; }
.abrir { color: var(--teal-700); font-size: .82rem; font-weight: 600; }
.seta { display: inline-block; font-style: normal; transition: transform .15s; }
.seta.girada { transform: rotate(90deg); }
.detalhe { background: var(--teal-50); padding: .9rem 1.25rem 1rem; font-size: .9rem; line-height: 1.5; border-top: 1px solid var(--borda); }
.detalhe p { margin: 0; }
.fonte { margin-top: .5rem !important; font-size: .82rem; color: var(--texto-2); }
</style>
