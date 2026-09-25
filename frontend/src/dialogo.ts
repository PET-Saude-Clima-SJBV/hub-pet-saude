import { reactive } from 'vue';

/**
 * Modais do sistema (no lugar de alert/confirm/prompt do navegador).
 *   if (await confirmar({ titulo: 'Apagar?', texto: '...', perigo: true })) { ... }
 *   const motivo = await pedirTexto({ titulo: 'Devolver', rotulo: 'Motivo' });   // null = cancelou
 *   await avisar({ titulo: 'Pronto', texto: '...' });
 */
interface Opcoes {
  titulo: string;
  texto?: string;
  confirmar?: string;     // rótulo do botão principal
  cancelar?: string | false;
  perigo?: boolean;       // botão principal vermelho
  rotulo?: string;        // se tiver, mostra um campo de texto
  obrigatorio?: boolean;
  placeholder?: string;
}

export const dialogo = reactive<{ aberto: boolean; opcoes: Opcoes; valor: string; resolver: ((v: string | boolean | null) => void) | null }>({
  aberto: false,
  opcoes: { titulo: '' },
  valor: '',
  resolver: null,
});

function abrir(opcoes: Opcoes) {
  dialogo.resolver?.(null); // fecha um anterior, se houver
  return new Promise<string | boolean | null>((resolve) => {
    Object.assign(dialogo, { aberto: true, opcoes, valor: '', resolver: resolve });
  });
}

export function fecharDialogo(resultado: string | boolean | null) {
  dialogo.aberto = false;
  const r = dialogo.resolver;
  dialogo.resolver = null;
  r?.(resultado);
}

export const confirmar = async (o: Opcoes) => (await abrir({ confirmar: 'Confirmar', cancelar: 'Cancelar', ...o })) === true;
export const pedirTexto = async (o: Opcoes) => (await abrir({ confirmar: 'Enviar', cancelar: 'Cancelar', obrigatorio: true, ...o, rotulo: o.rotulo ?? '' })) as string | null;
export const avisar = async (o: Opcoes) => { await abrir({ confirmar: 'Entendi', cancelar: false, ...o }); };
