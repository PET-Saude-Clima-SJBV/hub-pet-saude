<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { sessao } from '../sessao';

interface Indicador { titulo: string; valor: number; unidade: string | null; descricao: string; ficticio: boolean }
const indicadores = ref<Indicador[]>([]);
const erro = ref('');

onMounted(async () => {
  try {
    indicadores.value = (await api<{ indicadores: Indicador[] }>('/publico/resumo')).indicadores;
  } catch (e) {
    erro.value = 'Não foi possível carregar os dados agora.';
  }
});
</script>

<template>
  <div class="site">
    <header>
      <div class="topo">
        <div class="marca">HUB <span>PET-Saúde: Clima</span></div>
        <RouterLink :to="sessao.eu ? '/inicio' : '/login'" class="acesso">
          {{ sessao.eu ? 'Área da equipe' : 'Acesso da equipe' }}
        </RouterLink>
      </div>
      <div class="chamada">
        <h1>Clima e saúde em São João da Boa Vista</h1>
        <p>Acompanhamento público das ações do programa PET-Saúde: Clima, uma parceria entre a UNIFAE e a Secretaria Municipal de Saúde.</p>
      </div>
    </header>

    <main>
      <p v-if="erro" class="erro">{{ erro }}</p>
      <section class="cartoes">
        <article v-for="i in indicadores" :key="i.titulo" class="cartao kpi">
          <div class="valor">{{ i.valor.toLocaleString('pt-BR') }}<small v-if="i.unidade"> {{ i.unidade }}</small></div>
          <div class="titulo">{{ i.titulo }}</div>
          <p>{{ i.descricao }}</p>
          <span v-if="i.ficticio" class="selo ambar">dado ilustrativo</span>
        </article>
      </section>
      <p class="nota">Esta página mostra apenas dados agregados. Nenhuma informação pessoal é publicada.</p>
    </main>

    <footer>PET-Saúde: Clima · UNIFAE · Secretaria Municipal de Saúde de São João da Boa Vista</footer>
  </div>
</template>

<style scoped>
.site { min-height: 100vh; display: flex; flex-direction: column; }
header { background: linear-gradient(160deg, var(--teal-900), var(--teal-700)); color: #fff; padding: 1.25rem 1rem 3rem; }
.topo, .chamada, main { max-width: 1100px; margin: 0 auto; width: 100%; }
.topo { display: flex; justify-content: space-between; align-items: center; }
.marca { font-weight: 800; font-size: 1.15rem; }
.marca span { color: var(--ambar); font-weight: 600; }
.acesso { color: #fff; border: 1px solid rgba(255,255,255,.5); padding: .4rem .9rem; border-radius: 8px; text-decoration: none; font-size: .9rem; }
.acesso:hover { background: rgba(255,255,255,.1); }
.chamada { padding-top: 2.5rem; }
.chamada h1 { font-size: clamp(1.5rem, 4vw, 2.3rem); margin-bottom: .5rem; }
.chamada p { max-width: 640px; opacity: .88; line-height: 1.5; margin: 0; }
main { padding: 0 1rem; margin-top: -1.75rem; flex: 1; }
.cartoes { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.kpi .valor { font-size: 2.2rem; font-weight: 800; color: var(--teal-900); }
.kpi .titulo { font-weight: 700; margin-top: .2rem; }
.kpi p { color: var(--texto-2); font-size: .88rem; margin: .4rem 0 .6rem; }
.nota { color: var(--texto-2); font-size: .85rem; margin: 1.5rem 0; }
footer { text-align: center; font-size: .8rem; color: var(--texto-2); padding: 1.5rem 1rem; border-top: 1px solid var(--borda); }
</style>
