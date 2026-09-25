import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { config } from '../config';
import { SessaoOpcionalGuard, UsuarioSessao } from '../auth/guards';
import { Funcionalidade, FuncionalidadeGuard, FuncionalidadesService } from '../funcionalidades/funcionalidades';
import { ClimaService } from '../integracoes/clima/clima';

const CHAVES_PUBLICAS = ['pagina_publica', 'clima_publico', 'mapa_publico', 'mapa_problemas'];

/** Rotas abertas, sem login. Só dado agregado, nunca dado pessoal. */
@Controller('publico')
@UseGuards(SessaoOpcionalGuard, FuncionalidadeGuard)
@Funcionalidade('pagina_publica')
export class PublicoController {
  constructor(private db: DbService, private clima: ClimaService, private funcs: FuncionalidadesService) {}

  /** O que a página externa pode mostrar para quem está vendo agora. */
  @Get('funcionalidades')
  @Funcionalidade('')
  async funcionalidades(@Req() req: { usuario?: UsuarioSessao }) {
    const todas = await this.funcs.disponiveis(req.usuario);
    return Object.fromEntries(CHAVES_PUBLICAS.map((c) => [c, !!todas[c]]));
  }

  @Get('resumo')
  async resumo() {
    const indicadores = await this.db.query(
      'SELECT titulo, valor, unidade, descricao, detalhe, fonte, ficticio FROM hub.indicadores_publicos ORDER BY ordem',
    );
    return { ambiente: config.ambiente, atualizado_em: new Date().toISOString(), indicadores };
  }

  /** Camadas do mapa de problemas e doenças, com quantos registros cada uma tem. */
  @Get('mapa/camadas')
  @Funcionalidade('mapa_problemas')
  camadas() {
    return this.db.query(
      `SELECT c.chave, c.grupo, c.nome, c.descricao, c.exibicao, c.cor,
              count(r.id)::int AS total,
              COALESCE(bool_and(r.origem = 'ficticio'), true) AS ficticio,
              to_char(max(r.registrado_em), 'YYYY-MM-DD') AS ultimo_registro
       FROM hub.mapa_camadas c LEFT JOIN hub.mapa_registros r ON r.camada = c.chave
       WHERE c.publica GROUP BY c.chave ORDER BY c.ordem`);
  }

  /** Registros de uma camada. Só o necessário para desenhar: posição, intensidade e descrição curta. */
  @Get('mapa/camadas/:chave')
  @Funcionalidade('mapa_problemas')
  async registros(@Param('chave') chave: string) {
    const c = await this.db.um('SELECT chave, exibicao FROM hub.mapa_camadas WHERE chave = $1 AND publica', [chave]);
    if (!c) throw new NotFoundException('Camada não encontrada');
    const registros = await this.db.query(
      `SELECT round(lat::numeric, 5)::float AS lat, round(lng::numeric, 5)::float AS lng, intensidade::float AS intensidade,
              ${c.exibicao === 'pontos' ? 'descricao, territorio, ' : ''}to_char(registrado_em, 'YYYY-MM-DD') AS data
       FROM hub.mapa_registros WHERE camada = $1 ORDER BY registrado_em DESC LIMIT 2000`, [chave]);
    return { chave, exibicao: c.exibicao, registros };
  }

  @Get('clima')
  @Funcionalidade('clima_publico')
  climaAgora() {
    return this.clima.agora();
  }
}

@Controller()
export class SaudeController {
  constructor(private db: DbService) {}

  @Get('saude')
  async saude() {
    await this.db.query('SELECT 1');
    return { ok: true, ambiente: config.ambiente, versao: process.env.VERSAO ?? 'local' };
  }
}
