import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from './signed-token.js';

const SECRET = 's'.repeat(32);
const later = new Date('2030-01-02T00:00:00Z');
const now = new Date('2030-01-01T00:00:00Z');

describe('tokens firmados', () => {
  const token = signToken('verify-email', { userId: 'u1' }, SECRET, later);

  it('devuelve los datos de un token válido', () => {
    expect(verifyToken('verify-email', token, SECRET, now)).toEqual({ userId: 'u1' });
  });

  it('rechaza un token vencido', () => {
    expect(verifyToken('verify-email', token, SECRET, new Date('2030-01-03T00:00:00Z'))).toBeNull();
  });

  it('rechaza un token usado para otro propósito', () => {
    expect(verifyToken('reset-password', token, SECRET, now)).toBeNull();
  });

  it('rechaza un token con los datos cambiados', () => {
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ userId: 'u2', p: 'verify-email', exp: later.getTime() }),
    ).toString('base64url');
    expect(verifyToken('verify-email', `${forged}.${signature}`, SECRET, now)).toBeNull();
  });

  it('rechaza un token firmado con otra clave o mal formado', () => {
    expect(verifyToken('verify-email', token, 'x'.repeat(32), now)).toBeNull();
    expect(verifyToken('verify-email', 'basura', SECRET, now)).toBeNull();
  });
});
