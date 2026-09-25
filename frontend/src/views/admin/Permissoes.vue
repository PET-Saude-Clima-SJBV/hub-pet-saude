<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, PAPEIS } from '../../api';

interface Resposta {
  capacidades: Record<string, string>;
  escopos: string[];
  papeis: string[];
  matriz: { papel: string; capacidade: string; escopo: string }[];
}
const dados = ref<Resposta | null>(null);
const valores = ref<Record<string, string>>({});
const erro = ref('');
const salvo = ref('');
const alterado = ref(false);

const ROTULO_ESCOPO: Record<string, string> = { nenhum: '—', proprio: 'próprio', grupo: 'grupo', todos: 'todos' };

onMounted(async () => {
  try {
    dados.value = await api<Resposta>('/admin/permissoes');
    for (const l of dados.value.matriz) valores.value[`${l.papel}|${l.capacidade}`] = l.escopo;
  } catch (e) {
    erro.value = (e as Error).message;
  }
});

async function salvar() {
  erro.value = salvo.value = '';
  try {
    const linhas = Object.entries(valores.value).map(([k, escopo]) => {
      const [papel, capacidade] = k.split('|');
      return { papel, capacidade, escopo };
    });
    await api('/admin/permissoes', { metodo: 'PUT', corpo: linhas });
    salvo.value = 'Permissões salvas. Valem imediatamente neste ambiente.';
    alterado.value = false;
  } catch (e) {
    erro.value = (e as Error).message;
  }
}
</script>

<template>
  <div class="cabecalho">
    <div>
      <h1>Permissões por papel</h1>
      <p class="sub">O que cada nível do projeto pode fazer, e sobre o quê: só o <strong>próprio</strong>, o <strong>grupo</strong> PET da pessoa ou <strong>todos</strong>.</p>
    </div>
    <button class="botao" :disabled="!alterado" @click="salvar">Salvar</button>
  </div>

  <div class="aviso">
    Esta matriz é de <strong>cada ambiente</strong>: no dev pode ser mais aberta para testes. O <strong>Administrador do sistema</strong>
    pode tudo, independentemente do papel.
  </div>
  <p v-if="erro" class="erro">{{ erro }}</p>
  <p v-if="salvo" class="selo verde">{{ salvo }}</p>

  <section v-if="dados" class="cartao rolagem">
    <table class="tabela matriz">
      <thead>
        <tr><th>Capacidade</th><th v-for="p in dados.papeis" :key="p">{{ PAPEIS[p] }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(rotulo, cap) in dados.capacidades" :key="cap">
          <td><strong>{{ rotulo }}</strong><div class="miudo">{{ cap }}</div></td>
          <td v-for="p in dados.papeis" :key="p">
            <select v-model="valores[`${p}|${cap}`]" :class="valores[`${p}|${cap}`]" @change="alterado = true">
              <option v-for="e in dados.escopos" :key="e" :value="e">{{ ROTULO_ESCOPO[e] }}</option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.cabecalho { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.aviso { margin-bottom: 1rem; }
.miudo { font-size: .75rem; color: var(--texto-2); font-family: ui-monospace, Consolas, monospace; }
.matriz select { min-width: 92px; padding: .3rem .4rem; font-size: .85rem; }
.matriz select.nenhum { color: var(--texto-2); }
.matriz select.proprio { background: #FDF3E1; }
.matriz select.grupo { background: #E6F0FB; }
.matriz select.todos { background: #E3F4EE; font-weight: 600; }
</style>
