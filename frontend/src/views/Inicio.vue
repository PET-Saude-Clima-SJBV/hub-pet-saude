<script setup lang="ts">
import { ref } from 'vue';
import { sessao } from '../sessao';
import { api, AMBIENTES, NOME_AMBIENTE, PAPEIS } from '../api';
import PermissaoSelo from '../components/PermissaoSelo.vue';

const perm = (amb: string) => sessao.eu?.permissoes.find((p) => p.ambiente === amb);

const atual = ref('');
const nova = ref('');
const msg = ref('');
const erro = ref('');
async function trocarSenha() {
  msg.value = erro.value = '';
  try {
    await api('/auth/senha', { corpo: { atual: atual.value, nova: nova.value } });
    msg.value = 'Senha alterada.';
    atual.value = nova.value = '';
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
</script>

<template>
  <div v-if="sessao.eu">
    <h1>Olá, {{ sessao.eu.nome.split(' ')[0] }}</h1>
    <p class="sub">
      {{ PAPEIS[sessao.eu.papel] }}
      <span v-if="sessao.eu.admin_sistema" class="selo teal">Administrador do sistema</span>
    </p>

    <div class="grade duas">
      <section class="cartao">
        <h2>Meus acessos</h2>
        <table class="tabela">
          <thead><tr><th>Ambiente</th><th>Banco</th><th>Servidor</th></tr></thead>
          <tbody>
            <tr v-for="a in AMBIENTES" :key="a">
              <td>{{ NOME_AMBIENTE[a] }}</td>
              <td><PermissaoSelo :nivel="perm(a)?.banco ?? 'nenhum'" /></td>
              <td><span class="selo" :class="perm(a)?.servidor ? 'verde' : ''">{{ perm(a)?.servidor ? 'sim' : 'não' }}</span></td>
            </tr>
          </tbody>
        </table>
        <p class="detalhe">
          GitHub: <strong>{{ sessao.eu.github_usuario ? '@' + sessao.eu.github_usuario : 'não informado' }}</strong>
          ({{ sessao.eu.github_permissao }})<br />
          Usuário do servidor: <strong>{{ sessao.eu.usuario_servidor ?? 'não definido' }}</strong>
        </p>
      </section>

      <form class="cartao senha" @submit.prevent="trocarSenha">
        <h2>Trocar minha senha</h2>
        <label class="campo">Senha atual <input v-model="atual" type="password" autocomplete="current-password" required /></label>
        <label class="campo">Nova senha (mín. 10 caracteres) <input v-model="nova" type="password" autocomplete="new-password" minlength="10" required /></label>
        <p v-if="erro" class="erro">{{ erro }}</p>
        <p v-if="msg" class="selo verde">{{ msg }}</p>
        <div><button class="botao">Salvar</button></div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.detalhe { font-size: .88rem; color: var(--texto-2); margin: 1rem 0 0; line-height: 1.7; }
.senha { display: flex; flex-direction: column; gap: .9rem; }
</style>
