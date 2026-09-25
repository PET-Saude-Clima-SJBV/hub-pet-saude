<script setup lang="ts">
import { reactive } from 'vue';
import { itens } from '../catalogos';

/** Formulário da ficha do indicador: os campos da aba "Indicadores" da planilha de mapeamento. */
const props = defineProps<{ inicial?: Record<string, any> | null; editarNome?: boolean; rotuloSalvar?: string }>();
const emit = defineEmits<{ salvar: [dados: Record<string, any>]; cancelar: [] }>();

const CAMPOS = ['nome', 'o_que_mede', 'formula_numerador', 'formula_denominador', 'unidade', 'fonte', 'fonte_denominador',
  'periodicidade', 'desagregacao', 'tipo', 'linha_base', 'linha_base_data', 'linha_base_fonte', 'valor_alvo', 'prazo_alvo',
  'responsavel', 'responsavel_validacao', 'observacoes'];
const f = reactive<Record<string, any>>(Object.fromEntries(CAMPOS.map((c) => [c, props.inicial?.[c] ?? ''])));
</script>

<template>
  <form class="ficha" @submit.prevent="emit('salvar', { ...f })">
    <label v-if="editarNome" class="campo inteiro">Nome do indicador <input v-model="f.nome" required /></label>
    <label class="campo inteiro">O que mede (uma frase) <input v-model="f.o_que_mede" /></label>

    <fieldset>
      <legend>Fórmula</legend>
      <label class="campo">Numerador e definição de caso <textarea v-model="f.formula_numerador" rows="2"></textarea></label>
      <label class="campo">Denominador <textarea v-model="f.formula_denominador" rows="2" placeholder="vazio se for contagem simples"></textarea></label>
      <label class="campo">Unidade <input v-model="f.unidade" placeholder="%, casos / 100 mil hab., mutirões" /></label>
    </fieldset>

    <fieldset>
      <legend>Fontes e coleta</legend>
      <label class="campo">Fonte do numerador <input v-model="f.fonte" placeholder="SINAN, e-SUS APS, registro no HUB" /></label>
      <label class="campo">Fonte do denominador <input v-model="f.fonte_denominador" /></label>
      <label class="campo">Periodicidade
        <select v-model="f.periodicidade"><option value="">Não definida</option>
          <option v-for="p in itens('periodicidades')" :key="p.codigo" :value="p.codigo">{{ p.nome }}</option></select>
      </label>
      <label class="campo">Desagregação
        <select v-model="f.desagregacao"><option value="">Não definida</option>
          <option v-for="p in itens('desagregacoes')" :key="p.codigo" :value="p.codigo">{{ p.nome }}</option></select>
      </label>
      <label class="campo">Tipo
        <select v-model="f.tipo"><option value="">Não definido</option>
          <option v-for="p in itens('tipos_indicador')" :key="p.codigo" :value="p.codigo">{{ p.nome }}</option></select>
      </label>
    </fieldset>

    <fieldset>
      <legend>Linha de base e meta</legend>
      <label class="campo">Linha de base: valor <input v-model="f.linha_base" placeholder="ex.: 12,3" /></label>
      <label class="campo">Linha de base: data <input v-model="f.linha_base_data" placeholder="ex.: 2025" /></label>
      <label class="campo">Linha de base: fonte <input v-model="f.linha_base_fonte" /></label>
      <label class="campo">Meta: valor <input v-model="f.valor_alvo" placeholder="ex.: <= 11,3" /></label>
      <label class="campo">Meta: prazo <input v-model="f.prazo_alvo" placeholder="ex.: mês 24" /></label>
    </fieldset>

    <fieldset>
      <legend>Responsáveis</legend>
      <label class="campo">Pela coleta <input v-model="f.responsavel" /></label>
      <label class="campo">Pela validação <input v-model="f.responsavel_validacao" /></label>
    </fieldset>

    <label class="campo inteiro">Observações <textarea v-model="f.observacoes" rows="2"></textarea></label>
    <div class="acoes">
      <button class="botao">{{ rotuloSalvar ?? 'Salvar ficha' }}</button>
      <button type="button" class="botao secundario" @click="emit('cancelar')">Cancelar</button>
    </div>
  </form>
</template>

<style scoped>
.ficha { background: #F8F9F6; border: 1px solid var(--borda); border-radius: 10px; padding: 1rem; margin: .75rem 0; display: flex; flex-direction: column; gap: .8rem; }
fieldset { border: 0; border-top: 1px solid var(--borda); margin: 0; padding: .7rem 0 0; display: grid; gap: .7rem; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
legend { font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: var(--texto-2); padding-right: .5rem; }
textarea { font-family: inherit; font-size: .9rem; }
.acoes { display: flex; gap: .6rem; flex-wrap: wrap; }
</style>
