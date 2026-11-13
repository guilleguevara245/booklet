import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { JoseGoogleVerifier } from './google-verifier.js';

const CLIENT_ID = 'booklet-test.apps.googleusercontent.com';

describe('JoseGoogleVerifier', () => {
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let verifier: JoseGoogleVerifier;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
    verifier = new JoseGoogleVerifier(CLIENT_ID, createLocalJWKSet({ keys: [jwk] }));
  });

  const token = (claims: Record<string, unknown>, opts: { aud?: string; iss?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.iss ?? 'https://accounts.google.com')
      .setAudience(opts.aud ?? CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

  it('devuelve la identidad de un token válido', async () => {
    const t = await token({
      sub: '123',
      email: 'Ana@Gmail.com',
      email_verified: true,
      name: 'Ana',
    });
    await expect(verifier.verify(t)).resolves.toEqual({
      sub: '123',
      email: 'ana@gmail.com',
      emailVerified: true,
      name: 'Ana',
    });
  });

  it('rechaza un token emitido para otra aplicación', async () => {
    const t = await token({ sub: '1', email: 'a@gmail.com' }, { aud: 'otra-app' });
    await expect(verifier.verify(t)).rejects.toThrow();
  });

  it('rechaza un token que no emitió Google', async () => {
    const t = await token({ sub: '1', email: 'a@gmail.com' }, { iss: 'https://evil.example' });
    await expect(verifier.verify(t)).rejects.toThrow();
  });

  it('rechaza un token firmado con otra clave', async () => {
    const other = await generateKeyPair('RS256');
    const t = await new SignJWT({ sub: '1', email: 'a@gmail.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setExpirationTime('5m')
      .sign(other.privateKey);
    await expect(verifier.verify(t)).rejects.toThrow();
  });
});
