import { z } from 'zod';

const envSchema = z.object({
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
  /** ID de cliente OAuth de Google. Sin él, el inicio con Google responde 503. */
  GOOGLE_CLIENT_ID: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
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
