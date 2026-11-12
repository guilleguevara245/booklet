import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from '../src/app.factory.js';

/** Las pruebas de integración necesitan PostgreSQL y Redis reales. */
export const integrationReady = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);

export async function startApp(): Promise<NestFastifyApplication> {
  const app = await createApp({ CORS_ORIGIN: 'http://localhost:5173' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** Dirección única por prueba: las pruebas corren en paralelo sobre la misma base. */
export const uniqueSlug = (prefix = 'negocio') => `${prefix}-${randomUUID().slice(0, 8)}`;

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Atajo para pegarle a la API y obtener estado y cuerpo ya parseado. */
export function client(app: NestFastifyApplication) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de prueba sin tipar
  return async <T = any>(method: Method, url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, payload: payload as object | undefined });
    const body = res.body ? (res.json() as T) : (undefined as T);
    return { status: res.statusCode, body };
  };
}
