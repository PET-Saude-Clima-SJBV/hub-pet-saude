<script setup lang="ts">
import { computed, ref } from 'vue';
import { sessao } from '../sessao';
import { api, AMBIENTES, GRUPOS, NOME_AMBIENTE, PAPEIS } from '../api';
import PermissaoSelo from '../components/PermissaoSelo.vue';

const eu = computed(() => sessao.eu as any);
const perm = (amb: string) => eu.value?.permissoes.find((p: any) => p.ambiente === amb);
const dev = computed(() => eu.value?.perfil === 'desenvolvedor');

const PORTA: Record<string, number> = { dev: 5433, hml: 5434, prod: 5432 };
const comBanco = computed(() => AMBIENTES.filter((a) => perm(a)?.banco && perm(a).banco !== 'nenhum'));
const comTunel = computed(() => AMBIENTES.filter((a) => perm(a)?.servidor));
const comandoTunel = computed(() =>
  `ssh -N -p 9222 ${comTunel.value.map((a) => `-L ${PORTA[a]}:localhost:${PORTA[a]}`).join(' ')} ${eu.value?.usuario_servidor}@189.44.109.186`);
const verSenhaBanco = ref(false);

const atual = ref('');
const nova = ref('');
const msg = ref('');
const erro = ref('');
async function trocarSenha() {
  msg.value = erro.value = '';
  try {
    await api('/auth/senha', { corpo: { atual: atual.value, nova: nova.value } });
    msg.value = 'Senha alterada. Em alguns minutos ela passa a valer também nos outros ambientes.';
    atual.value = nova.value = '';
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
</script>

<template>
  <div v-if="eu">
    <h1>Olá, {{ eu.nome.split(' ')[0] }}</h1>
    <p class="sub">
      {{ PAPEIS[eu.papel] }}<template v-if="eu.grupo"> · {{ GRUPOS[eu.grupo] }}</template>
      <span v-if="eu.admin_sistema" class="selo teal">Administrador do sistema</span>
    </p>

    <div class="grade duas">
      <section class="cartao">
        <h2>Meus acessos</h2>
        <table class="tabela">
          <thead><tr><th>Ambiente</th><th>HUB</th><template v-if="dev"><th>Banco</th><th>Servidor</th></template></tr></thead>
          <tbody>
            <tr v-for="a in AMBIENTES" :key="a">
              <td>{{ NOME_AMBIENTE[a] }}</td>
              <td><span class="selo" :class="perm(a)?.hub ? 'verde' : ''">{{ perm(a)?.hub ? 'sim' : 'não' }}</span></td>
              <template v-if="dev">
                <td><PermissaoSelo :nivel="perm(a)?.banco ?? 'nenhum'" /></td>
                <td><span class="selo" :class="perm(a)?.servidor ? 'verde' : ''">{{ perm(a)?.servidor ? 'sim' : 'não' }}</span></td>
              </template>
            </tr>
          </tbody>
        </table>
        <p v-if="dev" class="detalhe">
          GitHub: <strong>{{ eu.github_usuario ? '@' + eu.github_usuario : 'não informado' }}</strong> ({{ eu.github_permissao }})
        </p>
      </section>

      <form class="cartao senha" @submit.prevent="trocarSenha">
        <h2>Trocar minha senha</h2>
        <p class="detalhe">A mesma senha vale em todos os ambientes do HUB em que você tem acesso.</p>
        <label class="campo">Senha atual <input v-model="atual" type="password" autocomplete="current-password" required /></label>
        <label class="campo">Nova senha (mín. 10 caracteres) <input v-model="nova" type="password" autocomplete="new-password" minlength="10" required /></label>
        <p v-if="erro" class="erro">{{ erro }}</p>
        <p v-if="msg" class="selo verde">{{ msg }}</p>
        <div><button class="botao">Salvar</button></div>
      </form>
    </div>

    <section v-if="dev && eu.usuario_servidor && (comBanco.length || comTunel.length)" class="cartao conexao">
      <h2>Como acessar os bancos</h2>
      <template v-if="comTunel.length">
        <p>1. Abra o túnel (deixe o terminal aberto enquanto usa):</p>
        <pre>{{ comandoTunel }}</pre>
        <p v-if="!eu.tem_chave_ssh" class="aviso">Sua chave SSH ainda não foi cadastrada. Envie o conteúdo do seu arquivo <code>.pub</code> ao tutor.</p>
      </template>
      <p>{{ comTunel.length ? '2.' : '' }} Conecte pelo DBeaver, pgAdmin ou psql:</p>
      <table class="tabela">
        <thead><tr><th>Banco</th><th>Host</th><th>Porta</th><th>Usuário</th><th>Permissão</th></tr></thead>
        <tbody>
          <tr v-for="a in comBanco" :key="a">
            <td><code>hub_{{ a }}</code></td><td>localhost</td><td>{{ PORTA[a] }}</td>
            <td><code>{{ eu.usuario_servidor }}</code></td><td><PermissaoSelo :nivel="perm(a).banco" /></td>
          </tr>
        </tbody>
      </table>
      <p class="detalhe">
        Senha do banco:
        <template v-if="eu.senha_banco">
          <code v-if="verSenhaBanco" class="segredo">{{ eu.senha_banco }}</code>
          <button type="button" class="link" @click="verSenhaBanco = !verSenhaBanco">{{ verSenhaBanco ? 'ocultar' : 'mostrar' }}</button>
        </template>
        <em v-else>ainda sendo gerada pelo sincronizador</em>
      </p>
    </section>
  </div>
</template>

<style scoped>
.detalhe { font-size: .88rem; color: var(--texto-2); margin: .75rem 0 0; line-height: 1.7; }
.senha { display: flex; flex-direction: column; gap: .9rem; }
.senha .detalhe { margin: -0.5rem 0 0; }
.conexao { margin-top: 1rem; }
.conexao p { font-size: .9rem; }
pre { background: #1F2A28; color: #E8F3F1; padding: .8rem 1rem; border-radius: 8px; overflow-x: auto; font-size: .82rem; }
.segredo { user-select: all; background: #F3F4F1; padding: .1rem .4rem; border-radius: 4px; }
.link { background: none; border: 0; color: var(--teal-700); cursor: pointer; font: inherit; text-decoration: underline; margin-left: .4rem; }
</style>
