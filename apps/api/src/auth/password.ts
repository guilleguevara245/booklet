import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Contraseñas con scrypt, que viene en Node: sin dependencias nativas que compilar.
// Formato guardado: scrypt$N$r$p$sal$hash (sal y hash en base64url).

const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
// scrypt usa 128 · N · r bytes de memoria (32 MiB con estos parámetros).
const maxmem = (N: number, r: number) => 128 * N * r * 2;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, opts, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p } = PARAMS;
  const key = await derive(password, salt, { N, r, p, maxmem: maxmem(N, r) });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const N = Number(n);
  const R = Number(r);
  const expected = Buffer.from(hash, 'base64url');
  const key = await derive(password, Buffer.from(salt, 'base64url'), {
    N,
    r: R,
    p: Number(p),
    maxmem: maxmem(N, R),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Hash fijo para comparar cuando el email no existe: así el inicio de sesión tarda lo mismo
 * y no revela qué emails tienen cuenta.
 */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword('contraseña-que-nadie-usa');
  return dummy;
}
