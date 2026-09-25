<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, ErroApi } from '../api';
import { sessao } from '../sessao';

interface Indicador { titulo: string; valor: number; unidade: string | null; descricao: string; ficticio: boolean }
const indicadores = ref<Indicador[]>([]);
const estado = ref<'carregando' | 'ok' | 'manutencao' | 'erro'>('carregando');

onMounted(async () => {
  try {
    indicadores.value = (await api<{ indicadores: Indicador[] }>('/publico/resumo')).indicadores;
    estado.value = 'ok';
  } catch (e) {
    estado.value = e instanceof ErroApi && e.status === 503 ? 'manutencao' : 'erro';
  }
});

const PARCEIROS = [
  { nome: 'Prefeitura de São João da Boa Vista', logo: '/logos/prefeitura-sjbv.png' },
  { nome: 'Instituto Federal de São Paulo, câmpus São João da Boa Vista', logo: '/logos/ifsp.png' },
  { nome: 'UNESP, câmpus de São João da Boa Vista', logo: '/logos/unesp.png' },
];
</script>

<template>
  <div class="site">
    <header>
      <div class="topo">
        <div class="marca">
          <img src="/logos/pet-saude-clima.png" alt="PET-Saúde Clima" />
          <span>HUB <b>PET-Saúde Clima</b></span>
        </div>
        <RouterLink :to="sessao.eu ? '/inicio' : '/login'" class="acesso">
          {{ sessao.eu ? 'Área da equipe' : 'Acesso da equipe' }}
        </RouterLink>
      </div>
      <div v-if="estado !== 'manutencao'" class="chamada">
        <h1>Clima e saúde em São João da Boa Vista</h1>
        <p>Acompanhamento público das ações do programa PET-Saúde: Clima, uma parceria entre a UNIFAE, a Secretaria Municipal de Saúde e as instituições de ensino do município.</p>
      </div>
    </header>

    <!-- desligada pelo administrador: aviso de manutenção -->
    <main v-if="estado === 'manutencao'" class="manutencao">
      <div class="cartao aviso-manutencao">
        <img src="/logos/pet-saude-clima.png" alt="" class="logo-grande" />
        <h1>Estamos atualizando esta página</h1>
        <p class="lead">O painel público do PET-Saúde: Clima está em manutenção para que os dados publicados aqui sejam revisados e continuem confiáveis.</p>
        <div class="motivos">
          <div><strong>O que acontece agora</strong><span>A equipe está conferindo e atualizando as informações sobre clima e saúde no município.</span></div>
          <div><strong>Quando volta</strong><span>Em breve, com dados e informações atualizados para a população.</span></div>
          <div><strong>Enquanto isso</strong><span>Em caso de calor extremo, chuva forte ou dúvidas de saúde, procure a UBS mais próxima.</span></div>
        </div>
        <p class="assinatura">Equipe PET-Saúde: Clima · São João da Boa Vista</p>
      </div>
    </main>

    <main v-else>
      <p v-if="estado === 'erro'" class="erro">Não foi possível carregar os dados agora. Tente novamente em alguns minutos.</p>
      <section class="cartoes">
        <article v-for="i in indicadores" :key="i.titulo" class="cartao kpi">
          <div class="valor">{{ i.valor.toLocaleString('pt-BR') }}<small v-if="i.unidade"> {{ i.unidade }}</small></div>
          <div class="titulo">{{ i.titulo }}</div>
          <p>{{ i.descricao }}</p>
          <span v-if="i.ficticio" class="selo ambar">dado ilustrativo</span>
        </article>
      </section>
      <p v-if="estado === 'ok'" class="nota">Esta página mostra apenas dados agregados. Nenhuma informação pessoal é publicada.</p>
    </main>

    <footer>
      <div class="parceiros">
        <span class="rotulo">Realização</span>
        <div class="logos">
          <img src="/logos/pet-saude-clima.png" alt="PET-Saúde Clima" title="PET-Saúde Clima" />
          <span class="texto-logo" title="Centro Universitário das Faculdades Associadas de Ensino">UNIFAE</span>
          <img v-for="p in PARCEIROS" :key="p.logo" :src="p.logo" :alt="p.nome" :title="p.nome" />
        </div>
      </div>
      <div class="linha">PET-Saúde: Clima · Ministério da Saúde · São João da Boa Vista / SP</div>
    </footer>
  </div>
</template>

<style scoped>
.site { min-height: 100vh; display: flex; flex-direction: column; background: var(--fundo); }
header { background: linear-gradient(160deg, var(--teal-900), var(--teal-700)); color: #fff; padding: 1rem 1rem 3rem; }
.topo, .chamada, main, .parceiros { max-width: 1100px; margin: 0 auto; width: 100%; }
.topo { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
.marca { display: flex; align-items: center; gap: .65rem; font-size: 1.05rem; }
.marca img { width: 46px; height: 46px; object-fit: contain; background: #fff; border-radius: 10px; padding: 3px; }
.marca b { color: var(--ambar); font-weight: 700; }
.acesso { color: #fff; border: 1px solid rgba(255, 255, 255, .5); padding: .4rem .9rem; border-radius: 8px; text-decoration: none; font-size: .9rem; white-space: nowrap; }
.acesso:hover { background: rgba(255, 255, 255, .1); }
.chamada { padding-top: 2.25rem; }
.chamada h1 { font-size: clamp(1.5rem, 4vw, 2.3rem); margin-bottom: .5rem; }
.chamada p { max-width: 660px; opacity: .9; line-height: 1.5; margin: 0; }
main { padding: 0 1rem; margin-top: -1.75rem; flex: 1; }
.cartoes { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.kpi .valor { font-size: 2.2rem; font-weight: 800; color: var(--teal-900); }
.kpi .titulo { font-weight: 700; margin-top: .2rem; }
.kpi p { color: var(--texto-2); font-size: .88rem; margin: .4rem 0 .6rem; }
.nota { color: var(--texto-2); font-size: .85rem; margin: 1.5rem 0; }

.manutencao { display: flex; justify-content: center; padding-bottom: 2rem; }
.aviso-manutencao { max-width: 720px; text-align: center; padding: 2.5rem 2rem; }
.logo-grande { width: 110px; height: auto; margin-bottom: .5rem; }
.aviso-manutencao h1 { color: var(--teal-900); font-size: clamp(1.4rem, 3.5vw, 1.9rem); }
.lead { color: var(--texto-2); font-size: 1.02rem; line-height: 1.6; max-width: 560px; margin: .75rem auto 1.5rem; }
.motivos { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); text-align: left; }
.motivos div { background: var(--teal-50); border-radius: 10px; padding: .9rem 1rem; display: flex; flex-direction: column; gap: .3rem; font-size: .88rem; color: var(--texto-2); }
.motivos strong { color: var(--teal-900); font-size: .92rem; }
.assinatura { margin: 1.5rem 0 0; font-size: .82rem; color: var(--texto-2); }

footer { background: #fff; border-top: 1px solid var(--borda); padding: 1.5rem 1rem 1rem; margin-top: 2rem; }
.parceiros { display: flex; flex-direction: column; align-items: center; gap: .8rem; }
.rotulo { font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; color: var(--texto-2); font-weight: 700; }
.logos { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 1.5rem 2.25rem; }
.logos img { height: 54px; width: auto; max-width: 150px; object-fit: contain; }
.texto-logo { font-weight: 800; font-size: 1.35rem; color: var(--texto); letter-spacing: .04em; } /* até recebermos o logo da UNIFAE */
.linha { text-align: center; font-size: .78rem; color: var(--texto-2); margin-top: 1.25rem; }
</style>
