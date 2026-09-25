<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { amplo, carregarSessao, sair, sessao } from './sessao';
import { api, NOME_AMBIENTE } from './api';
import Avatar from './components/Avatar.vue';
import Dialogo from './components/Dialogo.vue';

const rota = useRoute();
const router = useRouter();
const areaInterna = computed(() => !rota.meta.publica && !!sessao.eu);
const mostrarFaixa = computed(() => ['dev', 'hml', 'local'].includes(sessao.ambiente));
const eu = computed(() => sessao.eu as any);

interface Item { para: string; rotulo: string; exato?: boolean }
interface Grupo { chave: string; rotulo: string; itens: Item[] }

/** Menu: cada grupo só aparece se tiver algum item liberado para a pessoa. */
const menu = computed<Grupo[]>(() => {
  const g: Grupo[] = [];
  if (sessao.func.atividades && sessao.pode['atividades.registrar'] !== 'nenhum') g.push({
    chave: 'atividades', rotulo: 'Atividades', itens: [
      { para: '/atividades', rotulo: 'Minhas atividades', exato: true },
      ...(amplo('atividades.validar') ? [{ para: '/atividades/validacao', rotulo: 'Validação' }] : []),
      { para: '/atividades/resumo', rotulo: 'Resumo por pessoa' },
    ],
  });
  if (sessao.func.metas && amplo('metas.ver')) g.push({
    chave: 'projeto', rotulo: 'Projeto', itens: [{ para: '/metas', rotulo: 'Metas e ações' }, { para: '/indicadores', rotulo: 'Indicadores' }],
  });
  if (sessao.eu?.admin_sistema) g.push({
    chave: 'admin', rotulo: 'Administração', itens: [
      { para: '/admin/pessoas', rotulo: 'Pessoas e acessos' },
      { para: '/admin/permissoes', rotulo: 'Permissões por papel' },
      { para: '/admin/cadastros', rotulo: 'Cadastros' },
      { para: '/admin/funcionalidades', rotulo: 'Funcionalidades' },
      { para: '/admin/integracoes', rotulo: 'Integrações' },
      { para: '/admin/sincronizacao', rotulo: 'Sincronização' },
      { para: '/admin/auditoria', rotulo: 'Auditoria' },
    ],
  });
  g.push({ chave: 'publico', rotulo: 'Público', itens: [{ para: '/', rotulo: 'Página externa', exato: true }] });
  return g;
});

// grupos abertos/fechados, lembrados neste navegador
const CHAVE_MENU = 'hub.menu.abertos';
function lerAbertos(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CHAVE_MENU) ?? '{}'); } catch { return {}; }
}
const abertos = reactive<Record<string, boolean>>(lerAbertos());
const ativo = (i: Item) => i.exato ? rota.path === i.para : rota.path === i.para || rota.path.startsWith(i.para + '/');
const grupoAtivo = (g: Grupo) => g.itens.some(ativo);
const estaAberto = (g: Grupo) => abertos[g.chave] ?? true;
function alternar(g: Grupo) {
  abertos[g.chave] = !estaAberto(g);
  try { localStorage.setItem(CHAVE_MENU, JSON.stringify(abertos)); } catch { /* sem armazenamento */ }
}
// ao navegar para uma tela, abre o grupo dela
watch(() => rota.path, () => { for (const g of menu.value) if (grupoAtivo(g)) abertos[g.chave] = true; }, { immediate: true });

const menuCelular = reactive({ aberto: false });
watch(() => rota.path, () => (menuCelular.aberto = false));

async function logout() {
  await sair();
  router.push('/login');
}
async function voltarParaMim() {
  await api('/auth/voltar', { metodo: 'POST' });
  await carregarSessao();
  router.push('/admin/pessoas');
}
</script>

<template>
  <div v-if="mostrarFaixa" class="faixa" :class="sessao.ambiente">
    Ambiente de {{ NOME_AMBIENTE[sessao.ambiente] ?? 'teste local' }}: dados fictícios
  </div>
  <div v-if="eu?.por" class="ver-como">
    <span>Você está vendo o sistema como <strong>{{ eu.nome }}</strong>.</span>
    <button @click="voltarParaMim">Voltar para {{ eu.por.nome.split(' ')[0] }}</button>
  </div>

  <div v-if="areaInterna" class="casca">
    <aside class="lateral" :class="{ aberta: menuCelular.aberto }">
      <div class="marca">
        <img src="/logos/pet-saude-clima.png" alt="PET-Saúde Clima" />
        <div><strong>HUB</strong><span>PET-Saúde Clima</span></div>
        <button class="hamburguer" :aria-expanded="menuCelular.aberto" aria-label="Menu" @click="menuCelular.aberto = !menuCelular.aberto">☰</button>
      </div>
      <nav>
        <RouterLink to="/inicio" class="item solto" :class="{ ativo: rota.path === '/inicio' }">Minha área</RouterLink>
        <div v-for="g in menu" :key="g.chave" class="grupo" :class="{ contem: grupoAtivo(g) }">
          <button class="cabeca" :aria-expanded="estaAberto(g)" @click="alternar(g)">
            <span>{{ g.rotulo }}</span><span class="seta" :class="{ girada: estaAberto(g) }">›</span>
          </button>
          <div v-show="estaAberto(g)" class="itens">
            <RouterLink v-for="i in g.itens" :key="i.para" :to="i.para" class="item" :class="{ ativo: ativo(i) }">{{ i.rotulo }}</RouterLink>
          </div>
        </div>
      </nav>
      <div class="rodape">
        <RouterLink to="/inicio" class="quem">
          <Avatar :id="eu.id" :nome="eu.nome" :tem-foto="eu.tem_foto" :versao="eu.foto_versao" :tamanho="34" />
          <span>{{ eu.nome.split(' ')[0] }}</span>
        </RouterLink>
        <button class="sair" @click="logout">Sair</button>
      </div>
    </aside>
    <main class="conteudo"><RouterView /></main>
  </div>

  <RouterView v-else />
  <Dialogo />
</template>

<style scoped>
.faixa { text-align: center; font-size: .8rem; font-weight: 700; padding: .3rem; color: #fff; background: var(--azul); }
.faixa.hml { background: var(--ambar); color: #3b2a07; }
.faixa.local { background: #6b6b6b; }
.ver-como { display: flex; justify-content: center; align-items: center; gap: 1rem; flex-wrap: wrap; background: #3B2A6B; color: #fff; padding: .45rem 1rem; font-size: .88rem; }
.ver-como button { background: #fff; color: #3B2A6B; border: 0; border-radius: 6px; padding: .25rem .8rem; font: inherit; font-weight: 700; cursor: pointer; }

.casca { display: flex; min-height: 100vh; }
.lateral { width: 240px; flex-shrink: 0; background: var(--teal-900); color: #CFE3DF; display: flex; flex-direction: column; padding: 1rem .75rem; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.marca { display: flex; align-items: center; gap: .6rem; padding: 0 .35rem 1rem; }
.marca img { width: 42px; height: 42px; object-fit: contain; background: #fff; border-radius: 10px; padding: 3px; }
.marca strong { display: block; color: #fff; font-size: 1.15rem; line-height: 1; }
.marca span { color: var(--ambar); font-size: .78rem; font-weight: 600; }
.hamburguer { display: none; margin-left: auto; background: none; border: 0; color: #fff; font-size: 1.4rem; cursor: pointer; }
nav { display: flex; flex-direction: column; gap: .25rem; flex: 1; }
.item { display: block; color: #CFE3DF; text-decoration: none; padding: .45rem .7rem; border-radius: 7px; font-size: .9rem; }
.item:hover { background: rgba(255, 255, 255, .07); }
.item.ativo { background: var(--teal-700); color: #fff; font-weight: 600; }
.item.solto { margin-bottom: .35rem; }
.grupo .cabeca { width: 100%; display: flex; justify-content: space-between; align-items: center; background: none; border: 0; color: #CFE3DF; opacity: .75;
  font: inherit; font-size: .72rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; padding: .55rem .7rem .35rem; cursor: pointer; border-radius: 6px; }
.grupo .cabeca:hover { opacity: 1; background: rgba(255, 255, 255, .05); }
.grupo.contem .cabeca { opacity: 1; color: #fff; }
.seta { font-size: 1rem; transition: transform .15s; }
.seta.girada { transform: rotate(90deg); }
.itens { display: flex; flex-direction: column; gap: .1rem; padding-left: .35rem; border-left: 1px solid rgba(255, 255, 255, .1); margin-left: .7rem; }
.rodape { border-top: 1px solid rgba(255, 255, 255, .12); padding: .8rem .35rem 0; display: flex; align-items: center; justify-content: space-between; gap: .5rem; }
.quem { display: flex; align-items: center; gap: .55rem; color: #fff; text-decoration: none; font-size: .88rem; min-width: 0; }
.sair { background: none; border: 0; color: var(--ambar); cursor: pointer; padding: 0; font: inherit; font-size: .85rem; }
.conteudo { flex: 1; padding: 2rem; max-width: 1150px; min-width: 0; }

@media (max-width: 760px) {
  .casca { flex-direction: column; }
  .lateral { width: auto; height: auto; position: static; }
  .hamburguer { display: block; }
  .lateral:not(.aberta) nav, .lateral:not(.aberta) .rodape { display: none; }
  .marca { padding-bottom: 0; }
  .lateral.aberta .marca { padding-bottom: 1rem; }
  .conteudo { padding: 1.25rem 1rem; }
}
</style>
