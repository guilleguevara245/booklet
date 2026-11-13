import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  client,
  integrationReady,
  sessionHeaders,
  signUp,
  startApp,
  uniqueEmail,
  WEB_ORIGIN,
} from './helpers.js';

const password = 'contraseña segura';

describe.skipIf(!integrationReady)('cuentas (e2e)', () => {
  let app: NestFastifyApplication;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await startApp();
    api = client(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('registro', () => {
    it('crea la cuenta y deja una cookie de sesión segura', async () => {
      const email = uniqueEmail();
      const res = await api('POST', '/auth/register', {
        email: email.toUpperCase(),
        name: 'Ana',
        password,
      });
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email,
        name: 'Ana',
        hasPassword: true,
        hasGoogle: false,
      });
      expect(res.body.token).toBeUndefined(); // la web no ve el token
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });

    it('no permite registrar dos veces el mismo email', async () => {
      const { email } = await signUp(api);
      const res = await api('POST', '/auth/register', { email, name: 'Otra', password });
      expect(res.status).toBe(409);
    });

    it('exige una contraseña de al menos 10 caracteres', async () => {
      const res = await api('POST', '/auth/register', {
        email: uniqueEmail(),
        name: 'Ana',
        password: 'corta',
      });
      expect(res.status).toBe(400);
    });

    it('a las apps nativas les devuelve el token para usar como Bearer', async () => {
      const res = await api(
        'POST',
        '/auth/register',
        { email: uniqueEmail(), name: 'Ana', password },
        { 'x-booklet-client': 'native' },
      );
      expect(res.body.token).toEqual(expect.any(String));
      const me = await api('GET', '/auth/me', undefined, {
        authorization: `Bearer ${res.body.token}`,
      });
      expect(me.body.user.id).toBe(res.body.user.id);
    });
  });

  describe('inicio y cierre de sesión', () => {
    it('inicia sesión con la contraseña correcta', async () => {
      const { email, user } = await signUp(api);
      const res = await api('POST', '/auth/login', { email, password });
      expect(res.status).toBe(200);
      const me = await api('GET', '/auth/me', undefined, sessionHeaders(res.headers));
      expect(me.body.user.id).toBe(user.id);
    });

    it('responde lo mismo si el email no existe o si la contraseña está mal', async () => {
      const { email } = await signUp(api);
      const wrong = await api('POST', '/auth/login', { email, password: 'otra contraseña' });
      const missing = await api('POST', '/auth/login', { email: uniqueEmail(), password });
      expect(wrong.status).toBe(401);
      expect(missing.status).toBe(401);
      expect(wrong.body.message).toBe(missing.body.message);
    });

    it('bloquea después de 5 intentos fallidos', async () => {
      const { email } = await signUp(api);
      for (let i = 0; i < 5; i++) {
        expect((await api('POST', '/auth/login', { email, password: 'mal mal mal' })).status).toBe(
          401,
        );
      }
      // Bloqueado aunque ahora la contraseña sea la correcta.
      expect((await api('POST', '/auth/login', { email, password })).status).toBe(429);
    });

    it('cerrar sesión invalida el token', async () => {
      const { as } = await signUp(api);
      expect((await api('GET', '/auth/me', undefined, as)).status).toBe(200);
      expect((await api('POST', '/auth/logout', undefined, as)).status).toBe(204);
      expect((await api('GET', '/auth/me', undefined, as)).status).toBe(401);
    });

    it('sin sesión, /auth/me responde 401', async () => {
      expect((await api('GET', '/auth/me')).status).toBe(401);
      expect(
        (await api('GET', '/auth/me', undefined, { cookie: 'booklet_session=inventado' })).status,
      ).toBe(401);
    });
  });

  describe('protección CSRF', () => {
    it('rechaza un pedido con cookie de sesión desde otro origen', async () => {
      const { as } = await signUp(api);
      const res = await api('POST', '/auth/logout', undefined, {
        ...as,
        origin: 'https://sitio-malicioso.example',
      });
      expect(res.status).toBe(403);
    });

    it('rechaza un pedido con cookie de sesión sin origen', async () => {
      const { as } = await signUp(api);
      const res = await api('POST', '/auth/logout', undefined, { cookie: as.cookie! });
      expect(res.status).toBe(403);
    });

    it('acepta el origen de la web', async () => {
      const { as } = await signUp(api);
      expect(as.origin).toBe(WEB_ORIGIN);
      expect((await api('POST', '/auth/logout', undefined, as)).status).toBe(204);
    });
  });
});
