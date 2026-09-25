import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { config } from '../config';
import { SessaoOpcionalGuard, UsuarioSessao } from '../auth/guards';
import { Funcionalidade, FuncionalidadeGuard, FuncionalidadesService } from '../funcionalidades/funcionalidades';
import { ClimaService } from '../integracoes/clima/clima';

const CHAVES_PUBLICAS = ['pagina_publica', 'clima_publico', 'mapa_publico'];

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
      'SELECT titulo, valor, unidade, descricao, ficticio FROM hub.indicadores_publicos ORDER BY ordem',
    );
    return { ambiente: config.ambiente, atualizado_em: new Date().toISOString(), indicadores };
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
