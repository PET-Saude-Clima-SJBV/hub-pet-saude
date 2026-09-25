<script setup lang="ts">
defineProps<{ nivel: string }>();
const COR: Record<string, string> = { escrita: 'azul', leitura: 'verde', admin: 'teal', nenhum: '' };
</script>

<template>
  <span class="selo" :class="COR[nivel]">{{ nivel === 'nenhum' ? '-' : nivel }}</span>
</template>
