<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, AMBIENTES, GRUPOS, PAPEIS, Pessoa } from '../../api';
import { carregarPainel, painel } from '../../painel';
import { carregarSessao, sessao } from '../../sessao';
import { confirmar } from '../../dialogo';
import { useRouter } from 'vue-router';
import PermissaoSelo from '../../components/PermissaoSelo.vue';
import Avatar from '../../components/Avatar.vue';
import { carregarCatalogos, nomeDe } from '../../catalogos';

const router = useRouter();
const verComoDisponivel = computed(() => (sessao.eu as any)?.ver_como_disponivel);
async function verComo(p: Pessoa) {
  if (!(await confirmar({
    titulo: `Ver o sistema como ${p.nome.split(' ')[0]}?`,
    texto: `Você vai navegar exatamente com os acessos de ${p.nome} (${PAPEIS[p.papel]}). Tudo o que fizer fica registrado na auditoria em seu nome. Use "Voltar" na faixa roxa para retornar.`,
    confirmar: 'Ver como',
  }))) return;
  await api(`/admin/ver-como/${p.id}`, { metodo: 'POST' });
  await carregarSessao();
  router.push('/inicio');
}
import AvisoGerenciado from '../../components/AvisoGerenciado.vue';

const pessoas = ref<Pessoa[]>([]);
const filtro = ref('');
const perfil = ref<'todos' | 'desenvolvedor' | 'usuario'>('todos');
const erro = ref('');

onMounted(async () => {
  try {
    await Promise.all([carregarPainel(), carregarCatalogos()]);
    pessoas.value = await api<Pessoa[]>('/admin/usuarios');
  } catch (e) {
    erro.value = (e as Error).message;
  }
});

const contagem = computed(() => ({
  todos: pessoas.value.length,
  desenvolvedor: pessoas.value.filter((p) => p.perfil === 'desenvolvedor').length,
  usuario: pessoas.value.filter((p) => p.perfil === 'usuario').length,
}));
const visiveis = computed(() => {
  const f = filtro.value.trim().toLowerCase();
  return pessoas.value
    .filter((p) => perfil.value === 'todos' || p.perfil === perfil.value)
    .filter((p) => !f || `${p.nome} ${p.email} ${p.github_usuario ?? ''} ${vinculo(p)}`.toLowerCase().includes(f));
});
const perm = (p: Pessoa, amb: string) => p.permissoes.find((x) => x.ambiente === amb);
/** "Aluno(a), Engenharia de Software, UNIFAE" */
const vinculo = (p: any) =>
  [nomeDe('vinculos', p.vinculo), nomeDe('cursos', p.curso), nomeDe('instituicoes', p.instituicao, true)].filter(Boolean).join(', ');
</script>

<template>
  <div class="cabecalho">
    <div>
      <h1>Pessoas e acessos</h1>
      <p class="sub">Quem entra em cada ambiente do HUB e, para quem desenvolve, banco, servidor e GitHub.</p>
    </div>
    <RouterLink v-if="painel.modo === 'central'" to="/admin/pessoas/nova" class="botao">+ Nova pessoa</RouterLink>
  </div>

  <AvisoGerenciado />
  <p v-if="erro" class="erro">{{ erro }}</p>

  <section class="cartao">
    <div class="filtros">
      <div class="abas">
        <button :class="{ ativa: perfil === 'todos' }" @click="perfil = 'todos'">Todos ({{ contagem.todos }})</button>
        <button :class="{ ativa: perfil === 'desenvolvedor' }" @click="perfil = 'desenvolvedor'">Desenvolvedores ({{ contagem.desenvolvedor }})</button>
        <button :class="{ ativa: perfil === 'usuario' }" @click="perfil = 'usuario'">Usuários do sistema ({{ contagem.usuario }})</button>
      </div>
      <input v-model="filtro" placeholder="Buscar por nome, e-mail ou GitHub…" class="busca" />
    </div>

    <div class="rolagem">
      <table class="tabela">
        <thead>
          <tr>
            <th>Pessoa</th><th>Papel · grupo</th><th>GitHub</th>
            <th v-for="a in AMBIENTES" :key="a" class="amb">{{ a }}<br /><small>hub · banco · servidor</small></th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in visiveis" :key="p.id" :class="{ inativo: !p.ativo }">
            <td>
              <div class="pessoa">
                <Avatar :id="p.id" :nome="p.nome" :tem-foto="(p as any).tem_foto" :versao="(p as any).foto_versao" :tamanho="34" />
                <div>
                  <strong>{{ p.nome }}</strong>
                  <span v-if="p.admin_sistema" class="selo teal">admin</span>
                  <span v-if="!p.ativo" class="selo vermelho">inativo</span>
                  <span v-if="p.email.endsWith('@ficticio.pet')" class="selo">fictícia</span>
                  <div class="miudo">{{ p.email }}</div>
                </div>
              </div>
            </td>
            <td>
              {{ PAPEIS[p.papel] }}
              <div v-if="vinculo(p)" class="miudo">{{ vinculo(p) }}</div>
              <div class="miudo">{{ p.grupo ? GRUPOS[p.grupo] : '-' }} · {{ p.perfil === 'desenvolvedor' ? 'dev' : 'usuário' }}</div>
            </td>
            <td>
              <PermissaoSelo :nivel="p.github_permissao" />
              <div class="miudo">{{ p.github_usuario ? '@' + p.github_usuario : '' }}</div>
            </td>
            <td v-for="a in AMBIENTES" :key="a" class="amb">
              <span class="hub" :class="{ sim: perm(p, a)?.hub }" :title="perm(p, a)?.hub ? 'Entra no HUB' : 'Não entra no HUB'">
                {{ perm(p, a)?.hub ? 'HUB' : '-' }}
              </span>
              <template v-if="p.perfil === 'desenvolvedor'">
                <PermissaoSelo :nivel="perm(p, a)?.banco ?? 'nenhum'" />
                <span class="srv" :title="perm(p, a)?.servidor ? 'Acesso ao servidor' : 'Sem acesso ao servidor'">
                  {{ perm(p, a)?.servidor ? '●' : '○' }}
                </span>
              </template>
            </td>
            <td class="acoes-linha">
              <RouterLink :to="`/admin/pessoas/${p.id}`">{{ painel.modo === 'central' ? 'Editar' : 'Ver' }}</RouterLink>
              <button v-if="verComoDisponivel && p.id !== sessao.eu?.id && p.ativo && perm(p, painel.ambiente)?.hub"
                class="link" title="Ver o sistema como esta pessoa (só no dev e no hml)" @click="verComo(p)">Ver como</button>
            </td>
          </tr>
          <tr v-if="!visiveis.length"><td colspan="7" class="vazio">Nenhuma pessoa encontrada.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.cabecalho { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.filtros { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.abas { display: flex; gap: .25rem; flex-wrap: wrap; }
.abas button { border: 1px solid var(--borda); background: #fff; padding: .4rem .8rem; border-radius: 999px; font: inherit; font-size: .85rem; cursor: pointer; color: var(--texto-2); }
.abas button.ativa { background: var(--teal-700); border-color: var(--teal-700); color: #fff; font-weight: 600; }
.busca { max-width: 320px; }
.miudo { font-size: .8rem; color: var(--texto-2); }
.amb { text-align: center; white-space: nowrap; }
.amb small { text-transform: none; letter-spacing: 0; font-weight: 400; }
.hub { font-size: .72rem; font-weight: 700; color: var(--cinza); margin-right: .3rem; }
.hub.sim { color: var(--teal-700); }
.srv { margin-left: .35rem; color: var(--verde); }
.inativo { opacity: .55; }
.vazio { text-align: center; color: var(--texto-2); }
.selo { margin-left: .3rem; }
.pessoa { display: flex; gap: .6rem; align-items: center; }
.acoes-linha { white-space: nowrap; }
.acoes-linha .link { background: none; border: 0; color: #3B2A6B; cursor: pointer; font: inherit; font-size: .88rem; text-decoration: underline; margin-left: .7rem; padding: 0; }
</style>
