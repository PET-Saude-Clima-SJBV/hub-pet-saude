<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  id: string; nome: string; temFoto?: boolean; versao?: number; tamanho?: number;
}>(), { temFoto: false, versao: 0, tamanho: 36 });

const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
/** "Matheus Otero Romano" -> "MO" (nome + primeiro sobrenome) */
const iniciais = computed(() => {
  const partes = props.nome.trim().split(/\s+/).filter((p) => !LIGACOES.has(p.toLowerCase()));
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
});
// cor estável por pessoa, dentro da paleta do sistema
const CORES = ['#0F6B64', '#378ADD', '#1D9E75', '#8A5A10', '#6B4FA3', '#B3302F', '#0A4F49', '#2F6F9F'];
const cor = computed(() => CORES[[...props.id].reduce((t, c) => t + c.charCodeAt(0), 0) % CORES.length]);
</script>

<template>
  <span class="avatar" :style="{ width: tamanho + 'px', height: tamanho + 'px', fontSize: tamanho * 0.4 + 'px', background: temFoto ? undefined : cor }"
    :title="nome" role="img" :aria-label="nome">
    <img v-if="temFoto" :src="`/api/usuarios/${id}/foto?v=${versao}`" :alt="nome" />
    <template v-else>{{ iniciais }}</template>
  </span>
</template>

<style scoped>
.avatar { display: inline-grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 700; letter-spacing: .02em; overflow: hidden; flex-shrink: 0; background: #EEF0EC; user-select: none; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
