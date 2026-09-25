<script setup lang="ts">
/** De qual dispositivo veio o registro (auditoria). */
const props = defineProps<{ tipo?: string | null; detalhe?: string | null; comTexto?: boolean }>();
const ICONE: Record<string, string> = { celular: '📱', tablet: '📟', computador: '💻', desconhecido: '❔' };
const NOME: Record<string, string> = { celular: 'Celular', tablet: 'Tablet', computador: 'Computador', desconhecido: 'Dispositivo desconhecido' };
</script>

<template>
  <span v-if="props.tipo" class="dispositivo" :title="`${NOME[props.tipo] ?? props.tipo}${props.detalhe ? ' · ' + props.detalhe : ''}`">
    <span aria-hidden="true">{{ ICONE[props.tipo] ?? '❔' }}</span>
    <span v-if="props.comTexto" class="texto">{{ NOME[props.tipo] ?? props.tipo }}<template v-if="props.detalhe"> · {{ props.detalhe }}</template></span>
    <span v-else class="sr">{{ NOME[props.tipo] ?? props.tipo }}</span>
  </span>
</template>

<style scoped>
.dispositivo { display: inline-flex; align-items: center; gap: .3rem; font-size: .85rem; cursor: help; }
.texto { font-size: .78rem; color: var(--texto-2); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
