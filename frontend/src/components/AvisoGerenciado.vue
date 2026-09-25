<script setup lang="ts">
import { painel } from '../painel';
</script>

<template>
  <div v-if="painel.modo === 'gerenciado'" class="aviso gerenciado">
    <strong>Somente leitura.</strong> As pessoas e os acessos deste ambiente ({{ painel.ambiente }}) são
    gerenciados pelo <strong>painel central</strong>. Qualquer alteração deve ser feita lá.
  </div>
</template>

<style scoped>
.gerenciado { margin-bottom: 1rem; }
</style>
