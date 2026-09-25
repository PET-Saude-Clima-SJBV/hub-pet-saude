<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { amplo, sessao, sair } from './sessao';
import { NOME_AMBIENTE } from './api';

const rota = useRoute();
const router = useRouter();
const areaInterna = computed(() => !rota.meta.publica && !!sessao.eu);
const mostrarFaixa = computed(() => ['dev', 'hml', 'local'].includes(sessao.ambiente));

async function logout() {
  await sair();
  router.push('/login');
}
</script>

<template>
  <div v-if="mostrarFaixa" class="faixa" :class="sessao.ambiente">
    Ambiente de {{ NOME_AMBIENTE[sessao.ambiente] ?? 'teste local' }}: dados fictícios
  </div>

  <div v-if="areaInterna" class="casca">
    <aside class="lateral">
      <div class="marca">HUB <span>PET-Saúde</span></div>
      <nav>
        <RouterLink to="/inicio">Minha área</RouterLink>
        <template v-if="sessao.func.atividades && sessao.pode['atividades.registrar'] !== 'nenhum'">
          <div class="grupo">Atividades</div>
          <RouterLink to="/atividades" exact-active-class="router-link-active" active-class="">Minhas atividades</RouterLink>
          <RouterLink v-if="amplo('atividades.validar')" to="/atividades/validacao">Validação</RouterLink>
          <RouterLink to="/atividades/resumo">Resumo por pessoa</RouterLink>
        </template>
        <template v-if="sessao.func.metas && amplo('metas.ver')">
          <div class="grupo">Projeto</div>
          <RouterLink to="/metas">Metas e ações</RouterLink>
        </template>
        <template v-if="sessao.eu?.admin_sistema">
          <div class="grupo">Administração</div>
          <RouterLink to="/admin/pessoas">Pessoas e acessos</RouterLink>
          <RouterLink to="/admin/permissoes">Permissões por papel</RouterLink>
          <RouterLink to="/admin/funcionalidades">Funcionalidades</RouterLink>
          <RouterLink to="/admin/sincronizacao">Sincronização</RouterLink>
          <RouterLink to="/admin/auditoria">Auditoria</RouterLink>
        </template>
        <div class="grupo">Público</div>
        <RouterLink to="/">Página externa</RouterLink>
      </nav>
      <div class="rodape">
        <div class="quem">{{ sessao.eu?.nome }}</div>
        <button class="sair" @click="logout">Sair</button>
      </div>
    </aside>
    <main class="conteudo"><RouterView /></main>
  </div>

  <RouterView v-else />
</template>

<style scoped>
.faixa { text-align: center; font-size: .8rem; font-weight: 700; padding: .3rem; color: #fff; background: var(--azul); }
.faixa.hml { background: var(--ambar); color: #3b2a07; }
.faixa.local { background: #6b6b6b; }

.casca { display: flex; min-height: 100vh; }
.lateral {
  width: 230px; flex-shrink: 0; background: var(--teal-900); color: #CFE3DF;
  display: flex; flex-direction: column; padding: 1.25rem .9rem;
}
.marca { font-weight: 800; font-size: 1.2rem; color: #fff; padding: 0 .5rem 1.25rem; }
.marca span { color: var(--ambar); font-weight: 600; }
nav { display: flex; flex-direction: column; gap: .15rem; flex: 1; }
nav a { color: #CFE3DF; text-decoration: none; padding: .5rem .6rem; border-radius: 7px; font-size: .92rem; }
nav a:hover { background: rgba(255,255,255,.07); }
nav a.router-link-active { background: var(--teal-700); color: #fff; font-weight: 600; }
.grupo { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; opacity: .6; margin: 1rem .6rem .3rem; }
.rodape { border-top: 1px solid rgba(255,255,255,.12); padding: .9rem .5rem 0; }
.quem { font-size: .85rem; color: #fff; margin-bottom: .4rem; }
.sair { background: none; border: 0; color: var(--ambar); cursor: pointer; padding: 0; font: inherit; font-size: .85rem; }
.conteudo { flex: 1; padding: 2rem; max-width: 1150px; min-width: 0; }

@media (max-width: 760px) {
  .casca { flex-direction: column; }
  .lateral { width: auto; }
  nav { flex-direction: row; flex-wrap: wrap; }
  .grupo { display: none; }
  .conteudo { padding: 1.25rem 1rem; }
}
</style>
