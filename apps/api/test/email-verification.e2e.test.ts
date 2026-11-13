import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signToken } from '../src/common/signed-token.js';
import {
  client,
  integrationReady,
  mailbox,
  signUp,
  startApp,
  waitForMail,
  withSession,
} from './helpers.js';

const SECRET = 'solo-para-desarrollo-no-usar-en-produccion-0000';

describe.skipIf(!integrationReady)('verificación de email (e2e)', () => {
  let app: NestFastifyApplication;
  let anon: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await startApp();
    anon = client(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Saca el token del link del mail. */
  const tokenFrom = (text: string) => /\/verificar\?token=([\w.-]+)/.exec(text)?.[1];

  it('al registrarse llega el mail, y el link confirma el email', async () => {
    const { email, as } = await signUp(anon);
    const mail = await waitForMail(app, email);
    expect(mail.subject).toBe('Confirmá tu email en Booklet');
    const token = tokenFrom(mail.text);
    expect(token).toBeDefined();

    const res = await anon('POST', '/auth/verify-email', { token });
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
    expect((await anon('GET', '/auth/me', undefined, as)).body.user.emailVerified).toBe(true);
  });

  it('rechaza un link inventado o vencido', async () => {
    const { user } = await signUp(anon);
    expect((await anon('POST', '/auth/verify-email', { token: 'x'.repeat(30) })).status).toBe(400);
    const expired = signToken(
      'verify-email',
      { userId: user.id, email: user.email },
      SECRET,
      new Date(Date.now() - 1000),
    );
    expect((await anon('POST', '/auth/verify-email', { token: expired })).status).toBe(400);
  });

  it('reenvía el link, como mucho una vez por minuto', async () => {
    const { email, as } = await signUp(anon);
    const me = withSession(anon, as);
    expect((await me('POST', '/auth/resend-verification')).status).toBe(204);
    expect((await me('POST', '/auth/resend-verification')).status).toBe(429);
    // Llegan dos: el del registro y el reenviado.
    await waitForMail(app, email);
    await expect.poll(() => mailbox(app).to(email).length).toBe(2);
  });
});
