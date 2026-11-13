import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, integrationReady, signUp, startApp, uniqueSlug, withSession } from './helpers.js';

describe.skipIf(!integrationReady)('catálogo (e2e)', () => {
  let app: NestFastifyApplication;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await startApp();
    api = client(app);
    // Una dueña para todo el archivo: es dueña de cada negocio que crea.
    const owner = await signUp(api, 'Dueña');
    api = withSession(api, owner.as);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Negocio vacío listo para cargarle cosas. */
  async function setup() {
    const business = (
      await api('POST', '/businesses', { slug: uniqueSlug(), name: 'Peluquería Ana' })
    ).body;
    return { business, base: `/businesses/${business.id}` };
  }

  describe('negocios', () => {
    it('crea un negocio y lo encuentra por su dirección', async () => {
      const slug = uniqueSlug();
      const created = await api('POST', '/businesses', { slug, name: 'Consultorio Sur' });
      expect(created.status).toBe(201);
      const found = await api('GET', `/businesses/by-slug/${slug}`);
      expect(found.body).toMatchObject({ id: created.body.id, slug, name: 'Consultorio Sur' });
    });

    it('rechaza una dirección repetida con 409', async () => {
      const slug = uniqueSlug();
      await api('POST', '/businesses', { slug, name: 'Uno' });
      const again = await api('POST', '/businesses', { slug, name: 'Dos' });
      expect(again.status).toBe(409);
    });

    it('explica qué campo es inválido', async () => {
      const res = await api('POST', '/businesses', { slug: 'Con Espacios', name: '' });
      expect(res.status).toBe(400);
      const paths = res.body.issues.map((i: { path: string }) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['slug', 'name']));
    });

    it('responde 404 para un negocio que no existe y 400 para un id mal formado', async () => {
      expect((await api('GET', '/businesses/00000000-0000-4000-8000-000000000000')).status).toBe(
        404,
      );
      expect((await api('GET', '/businesses/no-es-un-uuid')).status).toBe(400);
    });
  });

  describe('sucursales y servicios', () => {
    it('crea una sucursal con la zona horaria de Buenos Aires por defecto', async () => {
      const { base } = await setup();
      const res = await api('POST', `${base}/locations`, { name: 'Palermo' });
      expect(res.status).toBe(201);
      expect(res.body.timezone).toBe('America/Argentina/Buenos_Aires');
    });

    it('rechaza una zona horaria inexistente', async () => {
      const { base } = await setup();
      const res = await api('POST', `${base}/locations`, { name: 'X', timezone: 'Marte/Olympus' });
      expect(res.status).toBe(400);
    });

    it('crea un servicio y lo da de baja', async () => {
      const { base } = await setup();
      const service = (
        await api('POST', `${base}/services`, { name: 'Corte', durationMinutes: 30 })
      ).body;
      const res = await api('PATCH', `${base}/services/${service.id}`, { active: false });
      expect(res.body).toMatchObject({ name: 'Corte', active: false, currency: 'ARS' });
    });

    it('no deja modificar un servicio desde otro negocio', async () => {
      const a = await setup();
      const b = await setup();
      const service = (
        await api('POST', `${b.base}/services`, { name: 'Corte', durationMinutes: 30 })
      ).body;
      expect((await api('PATCH', `${a.base}/services/${service.id}`, { name: 'X' })).status).toBe(
        404,
      );
    });
  });
});
