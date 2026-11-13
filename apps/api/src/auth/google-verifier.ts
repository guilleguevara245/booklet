import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Lo que Booklet usa del ID token de Google. */
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleVerifier {
  /** Verifica firma, emisor, audiencia y vencimiento. Lanza si el token no es válido. */
  verify(idToken: string): Promise<GoogleIdentity>;
}

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = new URL('https://www.googleapis.com/oauth2/v3/certs');

/**
 * Verifica ID tokens de Google con sus claves públicas (JWKS), que `jose` descarga y
 * guarda en caché. `keys` se puede reemplazar en las pruebas por claves locales.
 */
export class JoseGoogleVerifier implements GoogleVerifier {
  constructor(
    private readonly clientId: string,
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(GOOGLE_JWKS),
  ) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const { payload } = await jwtVerify(idToken, this.keys, {
      issuer: GOOGLE_ISSUERS,
      audience: this.clientId,
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new Error('El token no trae sub o email');
    }
    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' && payload.name ? payload.name : payload.email,
    };
  }
}
