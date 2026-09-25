import { Controller, Get, Injectable, UseGuards } from '@nestjs/common';
import { AdminGuard, LogadoGuard } from '../auth/guards';

/**
 * Camada de integrações: TODA chamada a um serviço fora da API (órgão externo, outro
 * serviço nosso no servidor) passa por aqui. Isso dá, de graça, para cada integração:
 *   - tempo limite (nunca trava a API esperando um serviço lento)
 *   - novas tentativas com espera crescente em falhas temporárias
 *   - cache com validade e "dado anterior se o serviço cair" (stale-if-error)
 *   - painel de saúde em Administração > Integrações (última resposta, falhas, latência)
 *
 * Para criar uma integração nova: um arquivo em integracoes/<nome>/ que chama
 * `this.integracoes.cliente('<nome>', {...}).buscar(...)`. Ver integracoes/clima/.
 */

export type TipoIntegracao = 'externa' | 'interna';

interface Estado {
  nome: string;
  descricao: string;
  tipo: TipoIntegracao;
  destino: string;
  chamadas: number;
  falhas: number;
  ultima_resposta_em: string | null;
  ultima_falha_em: string | null;
  ultimo_erro: string | null;
  latencia_ms: number | null;
  servindo_cache_antigo: boolean;
}

export interface OpcoesCliente {
  descricao: string;
  tipo: TipoIntegracao;
  destino: string;          // host/serviço (exibido no painel)
  timeoutMs?: number;       // padrão 5 s
  tentativas?: number;      // padrão 2 (1 + 1 nova tentativa)
  cacheSegundos?: number;   // padrão 0 (sem cache)
  cabecalhos?: Record<string, string>;
}

export class ErroIntegracao extends Error {
  constructor(public integracao: string, mensagem: string) {
    super(`${integracao}: ${mensagem}`);
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ClienteIntegracao {
  private cache = new Map<string, { em: number; valor: unknown }>();

  constructor(readonly nome: string, private opcoes: OpcoesCliente, private estado: Estado) {}

  /** GET que devolve JSON, com tempo limite, novas tentativas e cache. */
  async buscar<T>(url: string): Promise<T> {
    const ttl = (this.opcoes.cacheSegundos ?? 0) * 1000;
    const guardado = this.cache.get(url);
    if (guardado && Date.now() - guardado.em < ttl) return guardado.valor as T;

    const tentativas = this.opcoes.tentativas ?? 2;
    let ultimoErro = '';
    for (let n = 1; n <= tentativas; n++) {
      const inicio = Date.now();
      this.estado.chamadas++;
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'HUB-PET-Saude-Clima/1.0', Accept: 'application/json', ...this.opcoes.cabecalhos },
          signal: AbortSignal.timeout(this.opcoes.timeoutMs ?? 5000),
        });
        if (!r.ok) {
          ultimoErro = `HTTP ${r.status}`;
          if (r.status < 500 && r.status !== 429) break; // erro do pedido: não adianta repetir
        } else {
          const valor = (await r.json()) as T;
          Object.assign(this.estado, {
            ultima_resposta_em: new Date().toISOString(), latencia_ms: Date.now() - inicio, servindo_cache_antigo: false,
          });
          this.cache.set(url, { em: Date.now(), valor });
          return valor;
        }
      } catch (e) {
        ultimoErro = (e as Error).name === 'TimeoutError' ? `sem resposta em ${this.opcoes.timeoutMs ?? 5000} ms` : (e as Error).message;
      }
      if (n < tentativas) await espera(300 * 2 ** (n - 1));
    }

    Object.assign(this.estado, { ultima_falha_em: new Date().toISOString(), ultimo_erro: ultimoErro });
    this.estado.falhas++;
    if (guardado) {
      // o serviço caiu, mas temos a última resposta boa: melhor mostrar algo um pouco antigo do que nada
      this.estado.servindo_cache_antigo = true;
      return guardado.valor as T;
    }
    throw new ErroIntegracao(this.nome, ultimoErro);
  }
}

@Injectable()
export class IntegracoesService {
  private clientes = new Map<string, ClienteIntegracao>();
  private estados = new Map<string, Estado>();

  cliente(nome: string, opcoes: OpcoesCliente) {
    let c = this.clientes.get(nome);
    if (!c) {
      const estado: Estado = {
        nome, descricao: opcoes.descricao, tipo: opcoes.tipo, destino: opcoes.destino, chamadas: 0, falhas: 0,
        ultima_resposta_em: null, ultima_falha_em: null, ultimo_erro: null, latencia_ms: null, servindo_cache_antigo: false,
      };
      this.estados.set(nome, estado);
      c = new ClienteIntegracao(nome, opcoes, estado);
      this.clientes.set(nome, c);
    }
    return c;
  }

  listar() {
    return [...this.estados.values()];
  }
}

@Controller('admin/integracoes')
@UseGuards(LogadoGuard, AdminGuard)
export class IntegracoesController {
  constructor(private integracoes: IntegracoesService) {}

  @Get()
  listar() {
    return this.integracoes.listar();
  }
}
