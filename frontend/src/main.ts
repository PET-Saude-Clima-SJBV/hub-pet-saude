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
    { path: '/admin', redirect: '/admin/pessoas' },
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
  return true;
});

api<{ ambiente: string }>('/saude').then((s) => (sessao.ambiente = s.ambiente)).catch(() => {});

createApp(App).use(router).mount('#app');
