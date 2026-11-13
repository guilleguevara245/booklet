import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, integrationReady, signUp, startApp, uniqueSlug, withSession } from './helpers.js';

describe.skipIf(!integrationReady)('profesionales, horarios y cierres (e2e)', () => {
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

  /** Negocio con una sucursal, un servicio y una profesional que atiende lunes de 9 a 11. */
  async function setup() {
    const business = (
      await api('POST', '/businesses', { slug: uniqueSlug(), name: 'Peluquería Ana' })
    ).body;
    const base = `/businesses/${business.id}`;
    const location = (await api('POST', `${base}/locations`, { name: 'Palermo' })).body;
    const service = (await api('POST', `${base}/services`, { name: 'Corte', durationMinutes: 60 }))
      .body;
    const ana = (await api('POST', `${base}/staff`, { name: 'Ana', serviceIds: [service.id] }))
      .body;
    await api('PUT', `${base}/staff/${ana.id}/schedule`, {
      locationId: location.id,
      rules: [{ weekday: 1, start: '09:00', end: '11:00' }],
    });
    return { base, location, service, ana };
  }

  describe('profesionales', () => {
    it('crea una profesional con sus servicios', async () => {
      const { ana, service } = await setup();
      expect(ana).toMatchObject({ name: 'Ana', active: true, serviceIds: [service.id] });
    });

    it('no deja asignar un servicio de otro negocio', async () => {
      const a = await setup();
      const b = await setup();
      const res = await api('PUT', `${a.base}/staff/${a.ana.id}/services`, {
        serviceIds: [b.service.id],
      });
      expect(res.status).toBe(400);
    });

    it('no muestra profesionales de otro negocio', async () => {
      const a = await setup();
      const b = await setup();
      expect((await api('GET', `${a.base}/staff/${b.ana.id}`)).status).toBe(404);
    });
  });

  describe('horarios', () => {
    it('guarda el horario y lo devuelve en HH:MM', async () => {
      const { base, ana, location } = await setup();
      const res = await api('GET', `${base}/staff/${ana.id}/schedule`);
      expect(res.body).toEqual([
        { locationId: location.id, weekday: 1, start: '09:00', end: '11:00' },
      ]);
    });

    it('rechaza un horario que termina antes de empezar', async () => {
      const { base, ana, location } = await setup();
      const res = await api('PUT', `${base}/staff/${ana.id}/schedule`, {
        locationId: location.id,
        rules: [{ weekday: 1, start: '18:00', end: '09:00' }],
      });
      expect(res.status).toBe(400);
    });

    it('no deja usar una sucursal de otro negocio', async () => {
      const a = await setup();
      const b = await setup();
      const res = await api('PUT', `${a.base}/staff/${a.ana.id}/schedule`, {
        locationId: b.location.id,
        rules: [{ weekday: 1, start: '09:00', end: '10:00' }],
      });
      expect(res.status).toBe(404);
    });
  });

  describe('cierres', () => {
    it('crea, lista por rango y borra un cierre', async () => {
      const { base, ana } = await setup();
      const created = await api('POST', `${base}/closures`, {
        staffId: ana.id,
        startsAt: '2030-01-07T00:00:00-03:00',
        endsAt: '2030-01-14T00:00:00-03:00',
        reason: 'Vacaciones',
      });
      expect(created.status).toBe(201);
      expect(created.body.startsAt).toBe('2030-01-07T03:00:00.000Z');

      const inside = await api(
        'GET',
        `${base}/closures?from=2030-01-10T00:00:00Z&to=2030-01-11T00:00:00Z`,
      );
      expect(inside.body).toHaveLength(1);
      const after = await api('GET', `${base}/closures?from=2030-02-01T00:00:00Z`);
      expect(after.body).toHaveLength(0);

      expect((await api('DELETE', `${base}/closures/${created.body.id}`)).status).toBe(204);
      expect((await api('DELETE', `${base}/closures/${created.body.id}`)).status).toBe(404);
    });

    it('rechaza un cierre que termina antes de empezar', async () => {
      const { base } = await setup();
      const res = await api('POST', `${base}/closures`, {
        startsAt: '2030-01-07T12:00:00Z',
        endsAt: '2030-01-07T10:00:00Z',
      });
      expect(res.status).toBe(400);
    });
  });
});
