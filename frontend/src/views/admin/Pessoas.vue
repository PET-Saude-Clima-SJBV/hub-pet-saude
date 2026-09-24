<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, AMBIENTES, PAPEIS, Pessoa } from '../../api';
import PermissaoSelo from '../../components/PermissaoSelo.vue';

const pessoas = ref<Pessoa[]>([]);
const filtro = ref('');
const erro = ref('');

onMounted(async () => {
  try {
    pessoas.value = await api<Pessoa[]>('/admin/usuarios');
  } catch (e) {
    erro.value = (e as Error).message;
  }
});

const visiveis = computed(() => {
  const f = filtro.value.trim().toLowerCase();
  return f ? pessoas.value.filter((p) => `${p.nome} ${p.email} ${p.github_usuario ?? ''}`.toLowerCase().includes(f)) : pessoas.value;
});
const perm = (p: Pessoa, amb: string) => p.permissoes.find((x) => x.ambiente === amb);
</script>

<template>
  <div class="cabecalho">
    <div>
      <h1>Pessoas e acessos</h1>
      <p class="sub">Quem acessa o quê: HUB, GitHub, servidor e bancos de cada ambiente.</p>
    </div>
    <RouterLink to="/admin/pessoas/nova" class="botao">+ Nova pessoa</RouterLink>
  </div>

  <p v-if="erro" class="erro">{{ erro }}</p>

  <section class="cartao">
    <input v-model="filtro" placeholder="Buscar por nome, e-mail ou GitHub…" class="busca" />
    <div class="rolagem">
      <table class="tabela">
        <thead>
          <tr>
            <th>Pessoa</th><th>Papel</th><th>GitHub</th>
            <th v-for="a in AMBIENTES" :key="a" class="amb">{{ a }}<br /><small>banco · servidor</small></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in visiveis" :key="p.id" :class="{ inativo: !p.ativo }">
            <td>
              <strong>{{ p.nome }}</strong>
              <span v-if="p.admin_sistema" class="selo teal">admin</span>
              <span v-if="!p.ativo" class="selo vermelho">inativo</span>
              <div class="email">{{ p.email }}</div>
            </td>
            <td>{{ PAPEIS[p.papel] }}</td>
            <td>
              <PermissaoSelo :nivel="p.github_permissao" />
              <div class="email">{{ p.github_usuario ? '@' + p.github_usuario : '' }}</div>
            </td>
            <td v-for="a in AMBIENTES" :key="a" class="amb">
              <PermissaoSelo :nivel="perm(p, a)?.banco ?? 'nenhum'" />
              <span class="srv" :title="perm(p, a)?.servidor ? 'Acesso ao servidor' : 'Sem acesso ao servidor'">
                {{ perm(p, a)?.servidor ? '●' : '○' }}
              </span>
            </td>
            <td><RouterLink :to="`/admin/pessoas/${p.id}`">Editar</RouterLink></td>
          </tr>
          <tr v-if="!visiveis.length"><td colspan="7" class="vazio">Nenhuma pessoa encontrada.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.cabecalho { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.busca { max-width: 360px; margin-bottom: 1rem; }
.email { font-size: .8rem; color: var(--texto-2); }
.amb { text-align: center; white-space: nowrap; }
.amb small { text-transform: none; letter-spacing: 0; font-weight: 400; }
.srv { margin-left: .35rem; color: var(--verde); }
.inativo { opacity: .55; }
.vazio { text-align: center; color: var(--texto-2); }
.selo { margin-left: .3rem; }
</style>
