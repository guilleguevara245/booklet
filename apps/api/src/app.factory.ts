import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';
import { RealtimeAdapter } from './realtime/realtime.adapter.js';
import { REDIS } from './redis/redis.module.js';
import type { Redis } from 'ioredis';

/** Arma la aplicación con la misma configuración en producción y en las pruebas. */
export async function createApp(
  env: Pick<Env, 'CORS_ORIGIN'> & Partial<Pick<Env, 'TRUST_PROXY'>>,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: env.TRUST_PROXY ?? false }),
    { logger: ['error', 'warn', 'log'] },
  );
  return configureApp(app, env);
}

/** Plugins y CORS. Las pruebas que reemplazan un proveedor arman la app con esto. */
export async function configureApp(
  app: NestFastifyApplication,
  env: Pick<Env, 'CORS_ORIGIN'>,
): Promise<NestFastifyApplication> {
  await app.register(fastifyCookie);
  const origins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  // `credentials` permite que la web del panel mande la cookie de sesión.
  app.enableCors({ origin: origins, credentials: true });
  app.useWebSocketAdapter(new RealtimeAdapter(app, origins, app.get<Redis>(REDIS)));
  app.enableShutdownHooks();
  return app;
}
