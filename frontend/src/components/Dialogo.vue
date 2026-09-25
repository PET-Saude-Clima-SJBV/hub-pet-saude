<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { dialogo, fecharDialogo } from '../dialogo';

const campo = ref<HTMLTextAreaElement | null>(null);
const botao = ref<HTMLButtonElement | null>(null);

watch(() => dialogo.aberto, async (aberto) => {
  if (!aberto) return;
  await nextTick();
  (dialogo.opcoes.rotulo !== undefined ? campo.value : botao.value)?.focus();
});

function confirmar() {
  if (dialogo.opcoes.rotulo !== undefined) {
    if (dialogo.opcoes.obrigatorio && !dialogo.valor.trim()) return campo.value?.focus();
    return fecharDialogo(dialogo.valor.trim());
  }
  fecharDialogo(true);
}
function cancelar() {
  fecharDialogo(dialogo.opcoes.rotulo !== undefined ? null : false);
}
</script>

<template>
  <Transition name="dialogo">
    <div v-if="dialogo.aberto" class="fundo" @mousedown.self="dialogo.opcoes.cancelar !== false && cancelar()" @keydown.esc="dialogo.opcoes.cancelar !== false && cancelar()">
      <div class="caixa" role="dialog" aria-modal="true" :aria-labelledby="'dialogo-titulo'">
        <div class="icone" :class="{ perigo: dialogo.opcoes.perigo }">{{ dialogo.opcoes.perigo ? '!' : dialogo.opcoes.rotulo !== undefined ? '✎' : 'i' }}</div>
        <h2 id="dialogo-titulo">{{ dialogo.opcoes.titulo }}</h2>
        <p v-if="dialogo.opcoes.texto">{{ dialogo.opcoes.texto }}</p>
        <label v-if="dialogo.opcoes.rotulo !== undefined" class="campo">
          {{ dialogo.opcoes.rotulo }}
          <textarea ref="campo" v-model="dialogo.valor" rows="3" :placeholder="dialogo.opcoes.placeholder"
            @keydown.enter.ctrl="confirmar"></textarea>
        </label>
        <div class="botoes">
          <button v-if="dialogo.opcoes.cancelar !== false" class="botao secundario" @click="cancelar">{{ dialogo.opcoes.cancelar }}</button>
          <button ref="botao" class="botao" :class="{ perigo: dialogo.opcoes.perigo }"
            :disabled="dialogo.opcoes.rotulo !== undefined && dialogo.opcoes.obrigatorio && !dialogo.valor.trim()" @click="confirmar">
            {{ dialogo.opcoes.confirmar }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fundo { position: fixed; inset: 0; background: rgba(10, 40, 37, .45); backdrop-filter: blur(2px); display: grid; place-items: center; padding: 1rem; z-index: 1000; }
.caixa { background: var(--superficie); border-radius: 14px; width: 100%; max-width: 440px; padding: 1.5rem; box-shadow: 0 20px 50px rgba(0, 0, 0, .25); display: flex; flex-direction: column; gap: .75rem; }
.icone { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 1.1rem; background: var(--teal-50); color: var(--teal-900); }
.icone.perigo { background: #FDEDED; color: var(--vermelho); }
h2 { margin: 0; font-size: 1.15rem; }
p { margin: 0; color: var(--texto-2); line-height: 1.5; }
textarea { font-family: inherit; font-size: .92rem; }
.botoes { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .5rem; flex-wrap: wrap; }
.botao.perigo { background: var(--vermelho); border-color: var(--vermelho); color: #fff; }
.botao.perigo:hover { background: #c63c3b; }
.dialogo-enter-active, .dialogo-leave-active { transition: opacity .15s; }
.dialogo-enter-active .caixa, .dialogo-leave-active .caixa { transition: transform .15s; }
.dialogo-enter-from, .dialogo-leave-to { opacity: 0; }
.dialogo-enter-from .caixa { transform: translateY(8px) scale(.98); }
</style>
