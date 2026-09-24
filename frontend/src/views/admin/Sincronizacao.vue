<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, PAPEIS } from '../../api';

interface Item { sistema: string; ambiente?: string; acao: string; situacao: 'pendente' | 'alerta' }
interface Linha { usuario: { id: string; nome: string; papel: string; ativo: boolean }; itens: Item[] }
const plano = ref<Linha[]>([]);
const erro = ref('');

onMounted(async () => {
  try {
    plano.value = await api<Linha[]>('/admin/sincronizacao');
  } catch (e) {
    erro.value = (e as Error).message;
  }
});
const totais = computed(() => {
  const itens = plano.value.flatMap((l) => l.itens);
  return { pendente: itens.filter((i) => i.situacao === 'pendente').length, alerta: itens.filter((i) => i.situacao === 'alerta').length };
});
</script>

<template>
  <h1>Sincronização</h1>
  <p class="sub">O que precisa existir no GitHub, no servidor e nos bancos para refletir os acessos cadastrados.</p>

  <div class="aviso">
    Nesta versão o plano é <strong>calculado e exibido</strong>. A aplicação automática
    (convite no GitHub, túnel e usuários de banco) entra no próximo incremento.
  </div>

  <p v-if="erro" class="erro">{{ erro }}</p>

  <div class="totais">
    <span class="selo azul">{{ totais.pendente }} a aplicar</span>
    <span class="selo ambar">{{ totais.alerta }} alertas</span>
  </div>

  <section v-for="l in plano" :key="l.usuario.id" class="cartao pessoa">
    <h2>
      <RouterLink :to="`/admin/pessoas/${l.usuario.id}`">{{ l.usuario.nome }}</RouterLink>
      <small>{{ PAPEIS[l.usuario.papel] }}</small>
      <span v-if="!l.usuario.ativo" class="selo vermelho">inativo</span>
    </h2>
    <ul v-if="l.itens.length">
      <li v-for="(i, n) in l.itens" :key="n">
        <span class="selo" :class="i.situacao === 'alerta' ? 'ambar' : 'azul'">{{ i.situacao === 'alerta' ? 'alerta' : 'a aplicar' }}</span>
        <strong>{{ i.sistema }}<template v-if="i.ambiente"> · {{ i.ambiente }}</template></strong>
        {{ i.acao }}
      </li>
    </ul>
    <p v-else class="nada">Nenhum acesso externo a sincronizar.</p>
  </section>
</template>

<style scoped>
.totais { display: flex; gap: .5rem; margin: 1rem 0; }
.pessoa { margin-bottom: .75rem; }
.pessoa h2 { display: flex; align-items: center; gap: .6rem; }
.pessoa h2 a { text-decoration: none; }
.pessoa small { color: var(--texto-2); font-weight: 400; font-size: .85rem; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .45rem; font-size: .9rem; }
li { display: flex; gap: .5rem; align-items: baseline; flex-wrap: wrap; }
.nada { color: var(--texto-2); font-size: .9rem; margin: 0; }
</style>
