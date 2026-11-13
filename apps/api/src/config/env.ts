import { z } from 'zod';

const DEV_SECRET = 'solo-para-desarrollo-no-usar-en-produccion-0000';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    /**
     * Detrás de un proxy (Render, Fly, un balanceador), la IP real del cliente viene en
     * `X-Forwarded-For`. Sin esto, todos los pedidos parecen venir del proxy y el límite de
     * intentos por IP los cuenta juntos. No activarlo sin proxy: cualquiera podría inventar su IP.
     */
    TRUST_PROXY: z.stringbool().default(false),
    /** Dirección de la web: los links de los mails apuntan acá. */
    WEB_URL: z.url().default('http://localhost:5173'),
    /**
     * Cómo se mandan los mails: `smtp` (en desarrollo, a Mailpit; en producción, al proveedor),
     * `memory` (las pruebas los leen de una bandeja en memoria) o `log` (solo los anota).
     */
    MAIL_TRANSPORT: z.enum(['smtp', 'memory', 'log']).default('smtp'),
    SMTP_URL: z.url().default('smtp://localhost:1025'),
    MAIL_FROM: z.string().default('Booklet <no-responder@booklet.local>'),
    /** Corre el procesador de trabajos (mails, recordatorios) en este proceso. */
    WORKER_ENABLED: z.stringbool().default(true),
    /** Prefijo de las colas en Redis. Las pruebas usan uno distinto por instancia. */
    QUEUE_PREFIX: z.string().default('booklet'),
    /** Espera inicial entre reintentos de un trabajo fallido; después se duplica. */
    JOB_BACKOFF_MS: z.coerce.number().int().nonnegative().default(10_000),
    /** ID de cliente OAuth de Google. Sin él, el inicio con Google responde 503. */
    GOOGLE_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    /**
     * Clave para firmar los links de los mails. En producción es obligatoria y tiene que ser
     * larga y secreta (por ejemplo, `openssl rand -base64 48`).
     */
    APP_SECRET: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().min(32, 'Mínimo 32 caracteres').default(DEV_SECRET),
    ),
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.APP_SECRET !== DEV_SECRET, {
    error: 'En producción hay que definir APP_SECRET',
    path: ['APP_SECRET'],
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Valida las variables de entorno al arrancar. Si falta alguna o tiene un formato
 * inválido, la API no levanta y el error dice cuál es.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${detail}`);
  }
  return result.data;
}

export const ENV = Symbol('ENV');
