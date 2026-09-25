import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import { carregarSessao, sessao } from './sessao';
import { api } from './api';
import './estilo.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/Publico.vue'), meta: { publica: true } },
    { path: '/login', component: () => import('./views/Login.vue'), meta: { publica: true } },
    { path: '/inicio', component: () => import('./views/Inicio.vue') },
    { path: '/metas', component: () => import('./views/Metas.vue'), meta: { func: 'metas' } },
    { path: '/metas/:id', component: () => import('./views/MetaDetalhe.vue'), meta: { func: 'metas' } },
    { path: '/atividades', component: () => import('./views/Atividades.vue'), meta: { func: 'atividades' } },
    { path: '/atividades/validacao', component: () => import('./views/Validacao.vue'), meta: { func: 'atividades' } },
    { path: '/atividades/resumo', component: () => import('./views/Resumo.vue'), meta: { func: 'atividades' } },
    { path: '/admin', redirect: '/admin/pessoas' },
    { path: '/admin/funcionalidades', component: () => import('./views/admin/Funcionalidades.vue'), meta: { admin: true } },
    { path: '/admin/integracoes', component: () => import('./views/admin/Integracoes.vue'), meta: { admin: true } },
    { path: '/admin/permissoes', component: () => import('./views/admin/Permissoes.vue'), meta: { admin: true } },
    { path: '/admin/pessoas', component: () => import('./views/admin/Pessoas.vue'), meta: { admin: true } },
    { path: '/admin/pessoas/nova', component: () => import('./views/admin/PessoaForm.vue'), meta: { admin: true } },
    { path: '/admin/pessoas/:id', component: () => import('./views/admin/PessoaForm.vue'), meta: { admin: true } },
    { path: '/admin/sincronizacao', component: () => import('./views/admin/Sincronizacao.vue'), meta: { admin: true } },
    { path: '/admin/auditoria', component: () => import('./views/admin/Auditoria.vue'), meta: { admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  if (!sessao.carregada) await carregarSessao();
  if (to.meta.publica) return true;
  if (!sessao.eu) return { path: '/login', query: { volta: to.fullPath } };
  if (to.meta.admin && !sessao.eu.admin_sistema) return '/inicio';
  if (to.meta.func && !sessao.func[to.meta.func as string]) return '/inicio'; // funcionalidade desligada
  return true;
});

api<{ ambiente: string }>('/saude').then((s) => (sessao.ambiente = s.ambiente)).catch(() => {});

createApp(App).use(router).mount('#app');
