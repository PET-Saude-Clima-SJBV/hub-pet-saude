<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { api } from '../../api';

interface Integracao {
  nome: string; descricao: string; tipo: 'externa' | 'interna'; destino: string; chamadas: number; falhas: number;
  ultima_resposta_em: string | null; ultima_falha_em: string | null; ultimo_erro: string | null;
  latencia_ms: number | null; servindo_cache_antigo: boolean;
}
const lista = ref<Integracao[]>([]);
const erro = ref('');
let timer: number | undefined;

async function carregar() {
  try {
    lista.value = await api<Integracao[]>('/admin/integracoes');
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
onMounted(() => { carregar(); timer = window.setInterval(carregar, 15000); });
onUnmounted(() => clearInterval(timer));

function situacao(i: Integracao) {
  if (!i.ultima_resposta_em && !i.ultima_falha_em) return { rotulo: 'ainda não chamada', cor: '' };
  if (i.servindo_cache_antigo) return { rotulo: 'fora do ar (usando último dado)', cor: 'ambar' };
  const falhouPorUltimo = i.ultima_falha_em && (!i.ultima_resposta_em || i.ultima_falha_em > i.ultima_resposta_em);
  return falhouPorUltimo ? { rotulo: 'com falha', cor: 'vermelho' } : { rotulo: 'funcionando', cor: 'verde' };
}
const quando = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) : '—';
</script>

<template>
  <h1>Integrações</h1>
  <p class="sub">Serviços com que o HUB conversa — órgãos externos e serviços nossos no servidor — e como estão respondendo.</p>
  <p v-if="erro" class="erro">{{ erro }}</p>

  <section class="cartao rolagem">
    <table class="tabela">
      <thead><tr><th>Integração</th><th>Tipo</th><th>Situação</th><th>Última resposta</th><th>Latência</th><th>Chamadas / falhas</th></tr></thead>
      <tbody>
        <tr v-for="i in lista" :key="i.nome">
          <td><strong>{{ i.nome }}</strong><div class="miudo">{{ i.descricao }}</div><div class="miudo"><code>{{ i.destino }}</code></div></td>
          <td><span class="selo" :class="i.tipo === 'externa' ? 'azul' : 'teal'">{{ i.tipo }}</span></td>
          <td>
            <span class="selo" :class="situacao(i).cor">{{ situacao(i).rotulo }}</span>
            <div v-if="i.ultimo_erro" class="miudo">último erro: {{ i.ultimo_erro }} ({{ quando(i.ultima_falha_em) }})</div>
          </td>
          <td>{{ quando(i.ultima_resposta_em) }}</td>
          <td>{{ i.latencia_ms != null ? i.latencia_ms + ' ms' : '—' }}</td>
          <td>{{ i.chamadas }} / {{ i.falhas }}</td>
        </tr>
        <tr v-if="!lista.length"><td colspan="6" class="miudo">Nenhuma integração registrada.</td></tr>
      </tbody>
    </table>
  </section>
  <p class="miudo nota">Contadores desde o último reinício da API. Respostas ficam em cache (o clima, por 10 minutos), então nem toda visita gera uma chamada.</p>
</template>

<style scoped>
.miudo { font-size: .8rem; color: var(--texto-2); }
.nota { margin-top: .75rem; }
</style>
