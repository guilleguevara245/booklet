import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Tokens firmados con APP_SECRET y con vencimiento: `datos.firma`, en base64url. Sirven para
 * links de un solo propósito (verificar un email) sin guardar nada en la base.
 */
export function signToken(
  purpose: string,
  data: Record<string, string>,
  secret: string,
  expiresAt: Date,
): string {
  const payload = Buffer.from(
    JSON.stringify({ ...data, p: purpose, exp: expiresAt.getTime() }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

/** Devuelve los datos si la firma es válida, el propósito coincide y no venció; si no, `null`. */
export function verifyToken(
  purpose: string,
  token: string,
  secret: string,
  now = new Date(),
): Record<string, string> | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { p, exp, ...data } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (p !== purpose || typeof exp !== 'number' || exp <= now.getTime()) return null;
    return data;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
