import { randomInt, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { configureApp, createApp } from '../src/app.factory.js';
import { AppModule } from '../src/app.module.js';
import { MAILER, type MailMessage, type MemoryMailer } from '../src/mail/mailer.js';

/** Las pruebas de integración necesitan PostgreSQL y Redis reales. */
export const integrationReady = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);

/**
 * Cada app de prueba usa su propia cola en Redis: si no, el procesador de una app tomaría
 * los trabajos de otra (y sus mails irían a otra bandeja).
 */
function isolateQueue() {
  process.env.QUEUE_PREFIX = `test-${randomUUID()}`;
  process.env.JOB_BACKOFF_MS = '20';
}

export async function startApp(): Promise<NestFastifyApplication> {
  isolateQueue();
  const app = await createApp({ CORS_ORIGIN: 'http://localhost:5173' });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** Arma la app reemplazando proveedores, por ejemplo el verificador de Google. */
export async function startAppWith(
  overrides: { provide: unknown; useValue: unknown }[],
): Promise<NestFastifyApplication> {
  isolateQueue();
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const o of overrides) {
    builder = builder.overrideProvider(o.provide as symbol).useValue(o.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
    logger: ['error', 'warn'],
  });
  await configureApp(app, { CORS_ORIGIN: WEB_ORIGIN });
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
  // Cada cliente usa su propia IP, así los límites de intentos por IP no se mezclan entre
  // archivos de prueba ni entre corridas.
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
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
      remoteAddress: ip,
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

/** Devuelve un cliente que manda siempre los encabezados de esa sesión. */
export function withSession(
  api: ReturnType<typeof client>,
  as: Record<string, string>,
): ReturnType<typeof client> {
  return (method, url, payload, extra) => api(method, url, payload, { ...as, ...extra });
}

/** Encabezados de una sesión a partir de la cookie que devolvió la API. */
export function sessionHeaders(headers: Record<string, unknown>): Record<string, string> {
  const raw = headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [raw];
  const session = cookies.find((c) => typeof c === 'string' && c.startsWith('booklet_session='));
  if (!session) throw new Error('La respuesta no trajo cookie de sesión');
  return { cookie: String(session).split(';')[0]!, origin: WEB_ORIGIN };
}

/** La bandeja de mails en memoria de la app (MAIL_TRANSPORT=memory en las pruebas). */
export function mailbox(app: NestFastifyApplication): MemoryMailer {
  return app.get<MemoryMailer>(MAILER);
}

/** Espera a que llegue un mail a esa dirección que cumpla la condición (los manda la cola). */
export async function waitForMail(
  app: NestFastifyApplication,
  to: string,
  match: (m: MailMessage) => boolean = () => true,
  timeoutMs = 5000,
): Promise<MailMessage> {
  const start = Date.now();
  for (;;) {
    const found = mailbox(app).to(to).find(match);
    if (found) return found;
    if (Date.now() - start > timeoutMs) {
      const subjects = mailbox(app)
        .to(to)
        .map((m) => m.subject);
      throw new Error(`No llegó el mail esperado a ${to}. Llegaron: ${JSON.stringify(subjects)}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
