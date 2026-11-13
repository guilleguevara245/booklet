import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

/** Arma la aplicación con la misma configuración en producción y en las pruebas. */
export async function createApp(env: Pick<Env, 'CORS_ORIGIN'>): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['error', 'warn', 'log'],
  });
  await app.register(fastifyCookie);
  // `credentials` permite que la web del panel mande la cookie de sesión.
  app.enableCors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true });
  app.enableShutdownHooks();
  return app;
}
