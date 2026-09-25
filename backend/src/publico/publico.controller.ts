import { Controller, Get, UseGuards } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { config } from '../config';
import { Funcionalidade, FuncionalidadeGuard } from '../funcionalidades/funcionalidades';

/** Rotas abertas, sem login. Só dado agregado — nunca dado pessoal. */
@Controller('publico')
@UseGuards(FuncionalidadeGuard)
@Funcionalidade('pagina_publica')
export class PublicoController {
  constructor(private db: DbService) {}

  @Get('resumo')
  async resumo() {
    const indicadores = await this.db.query(
      'SELECT titulo, valor, unidade, descricao, ficticio FROM hub.indicadores_publicos ORDER BY ordem',
    );
    return { ambiente: config.ambiente, atualizado_em: new Date().toISOString(), indicadores };
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
