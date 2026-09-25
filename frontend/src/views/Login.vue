<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { entrar, sessao } from '../sessao';

const email = ref('');
const senha = ref('');
const erro = ref('');
const enviando = ref(false);
const rota = useRoute();
const router = useRouter();

async function enviar() {
  erro.value = '';
  enviando.value = true;
  try {
    await entrar(email.value, senha.value);
    const volta = typeof rota.query.volta === 'string' ? rota.query.volta : '';
    router.push(volta || (sessao.eu?.admin_sistema ? '/admin/pessoas' : '/inicio'));
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <div class="tela">
    <form class="cartao caixa" @submit.prevent="enviar">
      <img src="/logos/pet-saude-clima.png" alt="PET-Saúde Clima" class="logo" />
      <div class="marca">HUB <span>PET-Saúde Clima</span></div>
      <p class="sub">Acesso da equipe do projeto</p>
      <label class="campo">E-mail <input v-model="email" type="email" autocomplete="username" required autofocus /></label>
      <label class="campo">Senha <input v-model="senha" type="password" autocomplete="current-password" required /></label>
      <p v-if="erro" class="erro">{{ erro }}</p>
      <button class="botao" :disabled="enviando">{{ enviando ? 'Entrando…' : 'Entrar' }}</button>
      <RouterLink to="/" class="externo">Ver a página pública →</RouterLink>
    </form>
  </div>
</template>

<style scoped>
.tela { min-height: 90vh; display: grid; place-items: center; padding: 1rem; background: linear-gradient(160deg, var(--teal-900), var(--teal-700)); }
.caixa { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 1rem; padding: 2rem; }
.logo { width: 120px; height: auto; align-self: center; }
.marca { font-weight: 800; font-size: 1.5rem; color: var(--teal-900); text-align: center; }
.sub { text-align: center; }
.marca span { color: var(--ambar); }
.sub { margin: -0.75rem 0 0; }
.botao { justify-content: center; }
.externo { font-size: .85rem; text-align: center; }
</style>
