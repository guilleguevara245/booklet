import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GOOGLE_VERIFIER, type GoogleVerifier } from '../src/auth/google-verifier.js';
import {
  client,
  integrationReady,
  sessionHeaders,
  signUp,
  startAppWith,
  uniqueEmail,
} from './helpers.js';

/**
 * Verificador falso: el "token" es un JSON con la identidad. La verificación real de firma,
 * emisor y audiencia está probada aparte, en google-verifier.test.ts.
 */
const fakeGoogle: GoogleVerifier = {
  async verify(idToken) {
    if (!idToken.startsWith('{')) throw new Error('token inválido');
    return JSON.parse(idToken);
  },
};

const googleToken = (identity: {
  sub?: string;
  email: string;
  emailVerified?: boolean;
  name?: string;
}) =>
  JSON.stringify({ sub: randomUUID(), emailVerified: true, name: 'Ana', ...identity }).padEnd(20);

describe.skipIf(!integrationReady)('inicio con Google (e2e)', () => {
  let app: NestFastifyApplication;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await startAppWith([{ provide: GOOGLE_VERIFIER, useValue: fakeGoogle }]);
    api = client(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('crea la cuenta la primera vez y entra a la misma después', async () => {
    const identity = { sub: randomUUID(), email: uniqueEmail() };
    const first = await api('POST', '/auth/google', { idToken: googleToken(identity) });
    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({
      email: identity.email,
      hasGoogle: true,
      hasPassword: false,
      emailVerified: true,
    });
    const again = await api('POST', '/auth/google', { idToken: googleToken(identity) });
    expect(again.body.user.id).toBe(first.body.user.id);
    const me = await api('GET', '/auth/me', undefined, sessionHeaders(again.headers));
    expect(me.body.user.id).toBe(first.body.user.id);
  });

  it('vincula Google a una cuenta existente con el mismo email', async () => {
    const { user, email } = await signUp(api);
    const res = await api('POST', '/auth/google', { idToken: googleToken({ email }) });
    expect(res.body.user).toMatchObject({ id: user.id, hasGoogle: true, emailVerified: true });
  });

  it('si la cuenta existente no tenía el email verificado, le quita el acceso a quien la creó', async () => {
    // Alguien registra una cuenta con el email de otra persona, antes que ella.
    const { email, as: intruder } = await signUp(api, 'Intruso');
    // La dueña real entra con Google.
    const res = await api('POST', '/auth/google', { idToken: googleToken({ email }) });
    expect(res.body.user).toMatchObject({ hasPassword: false, hasGoogle: true });
    // La sesión y la contraseña del intruso ya no sirven.
    expect((await api('GET', '/auth/me', undefined, intruder)).status).toBe(401);
    const login = await api('POST', '/auth/login', { email, password: 'contraseña segura' });
    expect(login.status).toBe(401);
  });

  it('rechaza un email que Google no verificó', async () => {
    const res = await api('POST', '/auth/google', {
      idToken: googleToken({ email: uniqueEmail(), emailVerified: false }),
    });
    expect(res.status).toBe(401);
  });

  it('rechaza un token inválido', async () => {
    const res = await api('POST', '/auth/google', { idToken: 'esto-no-es-un-token-valido' });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!integrationReady)('inicio con Google sin configurar (e2e)', () => {
  it('responde 503 si falta GOOGLE_CLIENT_ID', async () => {
    const app = await startAppWith([{ provide: GOOGLE_VERIFIER, useValue: null }]);
    const res = await client(app)('POST', '/auth/google', {
      idToken: googleToken({ email: uniqueEmail() }),
    });
    expect(res.status).toBe(503);
    await app.close();
  });
});
