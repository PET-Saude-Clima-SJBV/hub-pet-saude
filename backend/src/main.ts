import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { DbModule, DbService } from './db/db.service';
import { criarAdminInicial, migrar } from './db/migrar';
import { AuthController } from './auth/auth.controller';
import { UsuariosController } from './usuarios/usuarios.controller';
import { PublicoController, SaudeController } from './publico/publico.controller';
import { AdminGuard, LogadoGuard } from './auth/guards';

@Module({
  imports: [DbModule, JwtModule.register({ secret: config.jwtSegredo })],
  controllers: [AuthController, UsuariosController, PublicoController, SaudeController],
  providers: [LogadoGuard, AdminGuard],
})
class AppModule {}

async function iniciar() {
  const app = await NestFactory.create(AppModule);
  const db = app.get(DbService);
  await migrar(db.pool);
  await criarAdminInicial(db.pool);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableShutdownHooks();
  await app.listen(config.porta, '0.0.0.0');
  console.log(`HUB API (${config.ambiente}) na porta ${config.porta}`);
}

iniciar().catch((e) => {
  console.error(e);
  process.exit(1);
});
