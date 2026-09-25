<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../api';
import Dispositivo from '../../components/Dispositivo.vue';

interface Registro { id: number; quando: string; ator_nome: string; acao: string; alvo_nome: string | null; detalhes: any }
const registros = ref<Registro[]>([]);
const aberto = ref<number | null>(null);
const erro = ref('');

onMounted(async () => {
  try {
    registros.value = await api<Registro[]>('/admin/auditoria?limite=200');
  } catch (e) {
    erro.value = (e as Error).message;
  }
});
const data = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
</script>

<template>
  <h1>Auditoria</h1>
  <p class="sub">Tudo o que foi feito na administração: quem, o quê, quando.</p>
  <p v-if="erro" class="erro">{{ erro }}</p>

  <section class="cartao rolagem">
    <table class="tabela">
      <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Sobre</th><th>Dispositivo</th><th></th></tr></thead>
      <tbody>
        <template v-for="r in registros" :key="r.id">
          <tr>
            <td class="quando">{{ data(r.quando) }}</td>
            <td>{{ r.ator_nome }}</td>
            <td>{{ r.acao }}</td>
            <td>{{ r.alvo_nome ?? '-' }}</td>
            <td><Dispositivo :tipo="(r as any).dispositivo" :detalhe="(r as any).dispositivo_detalhe" com-texto /></td>
            <td><button v-if="r.detalhes" class="link" @click="aberto = aberto === r.id ? null : r.id">detalhes</button></td>
          </tr>
          <tr v-if="aberto === r.id"><td colspan="6"><pre>{{ JSON.stringify(r.detalhes, null, 2) }}</pre></td></tr>
        </template>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.quando { white-space: nowrap; color: var(--texto-2); }
.link { background: none; border: 0; color: var(--teal-700); cursor: pointer; font: inherit; text-decoration: underline; }
pre { background: #F3F4F1; padding: .8rem; border-radius: 8px; font-size: .8rem; margin: 0; overflow-x: auto; }
</style>
