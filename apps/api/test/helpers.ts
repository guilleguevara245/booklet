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

/** Origen de la web en las pruebas: el único que puede usar la cookie de sesión. */
export const WEB_ORIGIN = 'http://localhost:5173';

/**
 * Atajo para pegarle a la API y obtener estado, cuerpo ya parseado y encabezados.
 * `as` manda los encabezados de una sesión (ver `signUp`).
 */
export function client(app: NestFastifyApplication) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cuerpos de prueba sin tipar
  return async <T = any>(
    method: Method,
    url: string,
    payload?: unknown,
    as?: Record<string, string>,
  ) => {
    const res = await app.inject({
      method,
      url,
      payload: payload as object | undefined,
      headers: as,
    });
    const body = res.body ? (res.json() as T) : (undefined as T);
    return { status: res.statusCode, body, headers: res.headers };
  };
}

export const uniqueEmail = (prefix = 'persona') =>
  `${prefix}-${randomUUID().slice(0, 8)}@example.com`;

/** Crea una cuenta y devuelve los encabezados para actuar con su sesión, como lo haría la web. */
export async function signUp(api: ReturnType<typeof client>, name = 'Ana') {
  const email = uniqueEmail();
  const res = await api('POST', '/auth/register', { email, name, password: 'contraseña segura' });
  if (res.status !== 201) throw new Error(`No se pudo registrar: ${res.status}`);
  return { user: res.body.user, email, as: sessionHeaders(res.headers) };
}

/** Encabezados de una sesión a partir de la cookie que devolvió la API. */
export function sessionHeaders(headers: Record<string, unknown>): Record<string, string> {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [raw];
  const session = cookies.find((c) => typeof c === 'string' && c.startsWith('booklet_session='));
  if (!session) throw new Error('La respuesta no trajo cookie de sesión');
  return { cookie: String(session).split(';')[0]!, origin: WEB_ORIGIN };
}
