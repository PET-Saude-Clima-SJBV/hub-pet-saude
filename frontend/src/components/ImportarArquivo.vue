<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../api';

/**
 * Importação de arquivo em duas etapas: envia e SIMULA (nada é gravado), mostra o relatório
 * linha a linha e só grava quando a pessoa confirma. Usado por qualquer tela com importação.
 *   <ImportarArquivo url-modelo="/api/indicadores/modelo" url-importar="/indicadores/importar" @importado="recarregar" />
 */
const props = defineProps<{ urlModelo: string; urlImportar: string; titulo?: string; explicacao?: string }>();
const emit = defineEmits<{ importado: [resumo: string] }>();

interface Linha { linha: number; nome: string; codigo?: string; antes?: string; meta?: string; preenchida?: number }
interface Relatorio { aplicado: boolean; linhas: number; iguais: number; colunas_ignoradas?: string[]; criar: Linha[]; atualizar: Linha[]; erros: { linha: number; mensagem: string }[] }

const arquivo = ref<File | null>(null);
const relatorio = ref<Relatorio | null>(null);
const ocupado = ref(false);
const erro = ref('');
const input = ref<HTMLInputElement | null>(null);

function escolher(ev: Event) {
  arquivo.value = (ev.target as HTMLInputElement).files?.[0] ?? null;
  relatorio.value = null;
  if (arquivo.value) enviar(true);
}
async function enviar(simular: boolean) {
  if (!arquivo.value) return;
  ocupado.value = true;
  erro.value = '';
  try {
    const fd = new FormData();
    fd.append('arquivo', arquivo.value);
    const r = await api<Relatorio>(`${props.urlImportar}?simular=${simular ? 1 : 0}`, { corpo: fd });
    if (simular) relatorio.value = r;
    else {
      emit('importado', `Importação concluída: ${r.criar.length} novo(s), ${r.atualizar.length} atualizado(s).`);
      arquivo.value = null;
      relatorio.value = null;
      if (input.value) input.value.value = '';
    }
  } catch (e) {
    erro.value = (e as Error).message;
    relatorio.value = null;
  } finally {
    ocupado.value = false;
  }
}
const nomeLinha = (i: Linha) => [i.meta, i.antes && i.antes !== i.nome ? `${i.antes} para ${i.nome}` : i.nome].filter(Boolean).join(' · ');
</script>

<template>
  <div class="cartao importar">
    <h2>{{ titulo ?? 'Importar de arquivo' }}</h2>
    <p class="miudo">{{ explicacao ?? 'Baixe o modelo, preencha e envie. Nada é gravado antes da sua confirmação.' }}</p>
    <div class="modelos">
      <span>Modelo:</span>
      <a class="botao secundario pequeno" :href="`${urlModelo}?formato=xlsx`">XLSX</a>
      <a class="botao secundario pequeno" :href="`${urlModelo}?formato=csv`">CSV</a>
      <a class="botao secundario pequeno" :href="`${urlModelo}?formato=txt`">TXT</a>
    </div>
    <label class="enviar">
      <input ref="input" type="file" accept=".xlsx,.csv,.txt" @change="escolher" />
    </label>
    <p v-if="erro" class="erro">{{ erro }}</p>
    <div v-if="ocupado" class="miudo">Conferindo o arquivo...</div>

    <div v-if="relatorio" class="relatorio">
      <div class="totais">
        <span class="selo verde">{{ relatorio.criar.length }} novos</span>
        <span class="selo azul">{{ relatorio.atualizar.length }} atualizados</span>
        <span v-if="relatorio.iguais" class="selo">{{ relatorio.iguais }} sem mudança</span>
        <span class="selo" :class="relatorio.erros.length ? 'vermelho' : ''">{{ relatorio.erros.length }} erros</span>
      </div>
      <p v-if="relatorio.colunas_ignoradas?.length" class="aviso-colunas">Colunas ignoradas (não fazem parte do modelo): {{ relatorio.colunas_ignoradas.join(", ") }}.</p>
      <ul v-if="relatorio.erros.length" class="erros">
        <li v-for="e in relatorio.erros" :key="e.linha">Linha {{ e.linha }}: {{ e.mensagem }}</li>
      </ul>
      <ul v-if="relatorio.criar.length || relatorio.atualizar.length" class="mudancas">
        <li v-for="i in relatorio.criar" :key="'c' + i.linha"><span class="selo verde">novo</span> {{ nomeLinha(i) }}
          <small v-if="i.preenchida !== undefined">ficha {{ i.preenchida }}/5</small></li>
        <li v-for="i in relatorio.atualizar" :key="'a' + i.linha"><span class="selo azul">atualiza</span> {{ nomeLinha(i) }}
          <small v-if="i.preenchida !== undefined">ficha {{ i.preenchida }}/5</small></li>
      </ul>
      <div class="acoes">
        <button class="botao" :disabled="!!relatorio.erros.length || (!relatorio.criar.length && !relatorio.atualizar.length) || ocupado"
          @click="enviar(false)">Confirmar importação</button>
        <span v-if="relatorio.erros.length" class="miudo">Corrija os erros no arquivo e envie de novo.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.importar { display: flex; flex-direction: column; gap: .7rem; }
.importar h2 { margin: 0; }
.miudo { font-size: .8rem; color: var(--texto-2); margin: 0; }
.modelos { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; font-size: .85rem; }
.pequeno { padding: .3rem .7rem; font-size: .8rem; }
.relatorio { border-top: 1px solid var(--borda); padding-top: .75rem; display: flex; flex-direction: column; gap: .6rem; }
.totais { display: flex; gap: .3rem; flex-wrap: wrap; }
.aviso-colunas { margin: 0; font-size: .82rem; color: #8A5A10; background: #FDF3E1; border-radius: 6px; padding: .4rem .6rem; }
.erros { margin: 0; padding-left: 1.2rem; color: #B3302F; font-size: .85rem; }
.mudancas { margin: 0; padding: 0; list-style: none; font-size: .85rem; max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: .25rem; }
.mudancas small { color: var(--texto-2); margin-left: .3rem; }
.acoes { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
</style>
