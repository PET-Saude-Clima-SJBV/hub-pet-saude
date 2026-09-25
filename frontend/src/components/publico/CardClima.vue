<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../../api';

type Nivel = 'tranquilo' | 'atencao' | 'alerta';
interface Orientacao { nivel: Nivel; titulo: string; texto: string }
interface AvisoOficial {
  id: number; evento: string; severidade: string; cor: string; inicio: string; fim: string; vigente: boolean;
  riscos: string[]; instrucoes: string[]; o_que_fazer: string | null;
}
interface Hora { hora: string; temperatura: number; chance_chuva: number; descricao: string; icone: string }
interface Dia { data: string; maxima: number; minima: number; chuva_mm: number; chance_chuva: number; uv_max: number; descricao: string; icone: string }
interface Clima {
  local: string; medido_em: string; condicao: { descricao: string; icone: string };
  temperatura: number; sensacao: number; umidade: number; vento_kmh: number; chuva_mm: number;
  hoje: Dia; horas: Hora[]; dias: Dia[]; nivel: Nivel;
  avisos_oficiais: AvisoOficial[]; avisos_indisponiveis: boolean; orientacoes: Orientacao[]; fontes: string[];
}

const clima = ref<Clima | null>(null);
const indisponivel = ref(false);

onMounted(async () => {
  try {
    clima.value = await api<Clima>('/publico/clima');
  } catch {
    indisponivel.value = true;
  }
});

const r = (n: number) => Math.round(n);
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "2026-09-26 12:00" -> "sáb 26/09 às 12h" */
function quando(s: string) {
  const [data, hora] = s.split(' ');
  const d = new Date(data + 'T12:00:00');
  const h = hora.endsWith(':00') ? `${Number(hora.slice(0, 2))}h` : hora;
  return `${DIAS_SEMANA[d.getDay()]} ${data.slice(8, 10)}/${data.slice(5, 7)} às ${h}`;
}
const nomeDia = (s: string, i: number) => i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DIAS_SEMANA[new Date(s + 'T12:00:00').getDay()];
</script>

<template>
  <section class="cartao clima" :class="clima?.nivel" aria-live="polite">
    <template v-if="clima">
      <!-- 1. aviso oficial: sempre primeiro -->
      <article v-for="a in clima.avisos_oficiais" :key="a.id" class="oficial" :style="{ '--cor-aviso': a.cor }" role="alert">
        <div class="oficial-topo">
          <span class="faixa-oficial">Aviso oficial INMET</span>
          <span class="severidade">{{ a.severidade }}</span>
        </div>
        <h3>{{ a.evento }}</h3>
        <p class="periodo">
          <strong>{{ a.vigente ? 'Em vigor' : 'Começa' }}</strong>
          {{ a.vigente ? 'até' : '' }} {{ a.vigente ? quando(a.fim) : quando(a.inicio) }}<template v-if="!a.vigente">, até {{ quando(a.fim) }}</template>
        </p>
        <p v-if="a.riscos.length" class="riscos">{{ a.riscos.join('. ') }}.</p>
        <p v-if="a.o_que_fazer" class="fazer"><strong>O que fazer:</strong> {{ a.o_que_fazer }}</p>
        <p v-for="i in a.instrucoes" :key="i" class="instrucao">{{ i }}.</p>
      </article>
      <p v-if="clima.avisos_indisponiveis" class="sem-oficial">
        Não foi possível consultar os avisos oficiais agora. Em caso de dúvida, ligue para a Defesa Civil: 199.
      </p>

      <!-- 2. agora -->
      <div class="agora-linha">
        <div class="agora">
          <div class="icone" aria-hidden="true">{{ clima.condicao.icone }}</div>
          <div>
            <div class="temp">{{ r(clima.temperatura) }}°<small>C</small></div>
            <div class="cond">{{ clima.condicao.descricao }}, sensação de {{ r(clima.sensacao) }}°C</div>
            <div class="miudo">{{ clima.local }}, medido às {{ clima.medido_em.slice(11, 16) }}</div>
          </div>
        </div>
        <dl class="medidas">
          <div><dt>Umidade</dt><dd>{{ clima.umidade }}%</dd></div>
          <div><dt>Vento</dt><dd>{{ r(clima.vento_kmh) }} km/h</dd></div>
          <div><dt>Hoje</dt><dd>{{ r(clima.hoje.minima) }}° a {{ r(clima.hoje.maxima) }}°</dd></div>
          <div><dt>UV máximo</dt><dd>{{ r(clima.hoje.uv_max) }}</dd></div>
        </dl>
      </div>

      <!-- 3. orientação própria (medições do momento) -->
      <div v-if="clima.orientacoes.length" class="orientacoes">
        <div v-for="o in clima.orientacoes" :key="o.titulo" class="orientacao" :class="o.nivel">
          <strong>{{ o.titulo }}</strong>
          <span>{{ o.texto }}</span>
        </div>
      </div>

      <!-- 4. próximas horas -->
      <div class="faixa-horas" aria-label="Previsão para as próximas horas">
        <div v-for="h in clima.horas" :key="h.hora" class="hora">
          <span class="h">{{ h.hora }}</span>
          <span class="ic" :title="h.descricao">{{ h.icone }}</span>
          <strong>{{ r(h.temperatura) }}°</strong>
          <span class="chuva" :class="{ alta: h.chance_chuva >= 60 }">{{ h.chance_chuva }}%</span>
        </div>
      </div>

      <!-- 5. próximos dias -->
      <div class="dias" aria-label="Previsão para os próximos dias">
        <div v-for="(d, i) in clima.dias" :key="d.data" class="dia">
          <span class="nome">{{ nomeDia(d.data, i) }}</span>
          <span class="ic" :title="d.descricao">{{ d.icone }}</span>
          <span><strong>{{ r(d.maxima) }}°</strong> {{ r(d.minima) }}°</span>
          <span class="chuva" :class="{ alta: d.chance_chuva >= 60 }">chuva {{ d.chance_chuva }}%</span>
        </div>
      </div>

      <p class="fonte">
        Fontes: {{ clima.fontes.join(' e ') }}. Emergência: Defesa Civil 199, Bombeiros 193, SAMU 192.
      </p>
    </template>
    <p v-else-if="indisponivel" class="sem-oficial">Os dados do clima estão indisponíveis agora. Em caso de dúvida, ligue para a Defesa Civil: 199.</p>
    <p v-else class="miudo">Carregando o clima...</p>
  </section>
</template>

<style scoped>
.clima { display: flex; flex-direction: column; gap: 1rem; border-top: 5px solid var(--verde); }
.clima.atencao { border-top-color: var(--ambar); }
.clima.alerta { border-top-color: var(--vermelho); }

.oficial { border: 2px solid var(--cor-aviso); border-left-width: 10px; border-radius: 10px; padding: .9rem 1.1rem;
  background: color-mix(in srgb, var(--cor-aviso) 9%, #fff); display: flex; flex-direction: column; gap: .35rem; }
.oficial-topo { display: flex; justify-content: space-between; gap: .5rem; flex-wrap: wrap; align-items: center; }
.faixa-oficial { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--texto); }
.severidade { background: var(--cor-aviso); color: #fff; font-weight: 800; font-size: .8rem; padding: .2rem .7rem; border-radius: 999px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, .35); }
.oficial h3 { margin: 0; font-size: 1.35rem; color: var(--texto); }
.oficial p { margin: 0; font-size: .92rem; line-height: 1.45; }
.periodo { font-size: 1rem !important; }
.fazer { background: #fff; border-radius: 8px; padding: .55rem .75rem; }
.instrucao { color: var(--texto-2); }
.sem-oficial { margin: 0; background: #FDF3E1; border-radius: 8px; padding: .7rem .9rem; font-weight: 600; color: #6b4608; }

.agora-linha { display: grid; gap: 1rem 1.5rem; grid-template-columns: auto 1fr; align-items: center; }
@media (max-width: 760px) { .agora-linha { grid-template-columns: 1fr; } }
.agora { display: flex; gap: .9rem; align-items: center; }
.icone { font-size: 3rem; line-height: 1; }
.temp { font-size: 2.6rem; font-weight: 800; color: var(--teal-900); line-height: 1; }
.temp small { font-size: 1.1rem; font-weight: 600; }
.cond { font-weight: 600; margin-top: .2rem; }
.miudo { font-size: .8rem; color: var(--texto-2); margin: 0; }
.medidas { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; margin: 0; }
@media (max-width: 480px) { .medidas { grid-template-columns: repeat(2, 1fr); } }
.medidas div { background: #F6F7F5; border-radius: 8px; padding: .5rem .7rem; }
.medidas dt { font-size: .72rem; color: var(--texto-2); text-transform: uppercase; letter-spacing: .04em; }
.medidas dd { margin: .1rem 0 0; font-weight: 700; font-size: 1.05rem; }

.orientacoes { display: flex; flex-direction: column; gap: .5rem; }
.orientacao { display: flex; flex-direction: column; gap: .15rem; padding: .65rem .85rem; border-radius: 8px; font-size: .9rem; background: #E3F4EE; }
.orientacao.atencao { background: #FDF3E1; }
.orientacao.alerta { background: #FDEDED; }
.orientacao span { color: var(--texto-2); }

.faixa-horas { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(58px, 1fr); gap: .35rem; overflow-x: auto; padding-bottom: .25rem; }
.hora { display: flex; flex-direction: column; align-items: center; gap: .1rem; background: #F6F7F5; border-radius: 8px; padding: .45rem .2rem; font-size: .8rem; }
.hora .h { color: var(--texto-2); }
.ic { font-size: 1.2rem; }
.chuva { font-size: .74rem; color: var(--azul); }
.chuva.alta { font-weight: 800; }
.dias { display: grid; grid-template-columns: repeat(5, 1fr); gap: .4rem; }
@media (max-width: 560px) { .dias { grid-template-columns: repeat(3, 1fr); } }
.dia { display: flex; flex-direction: column; align-items: center; gap: .15rem; border: 1px solid var(--borda); border-radius: 8px; padding: .5rem .3rem; font-size: .85rem; }
.dia .nome { font-weight: 700; text-transform: capitalize; }
.fonte { font-size: .75rem; color: var(--texto-2); margin: 0; }
</style>
