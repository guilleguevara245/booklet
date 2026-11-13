import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, integrationReady, startApp, uniqueSlug } from './helpers.js';

// 2030-01-07 es lunes. Buenos Aires es UTC-3: 09:00 local = 12:00Z.
const NINE = '2030-01-07T09:00:00-03:00';
const customer = { name: 'Juana Pérez', email: 'juana@example.com', phone: '+54 9 11 5555-1234' };

describe.skipIf(!integrationReady)('reservas (e2e)', () => {
  let app: NestFastifyApplication;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await startApp();
    api = client(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Negocio con una profesional que atiende lunes de 9 a 12 un servicio de 60 minutos + 15 de margen. */
  async function setup() {
    const business = (
      await api('POST', '/businesses', { slug: uniqueSlug(), name: 'Peluquería Ana' })
    ).body;
    const base = `/businesses/${business.id}`;
    const location = (await api('POST', `${base}/locations`, { name: 'Palermo' })).body;
    const service = (
      await api('POST', `${base}/services`, {
        name: 'Corte',
        durationMinutes: 60,
        bufferMinutes: 15,
      })
    ).body;
    const ana = (await api('POST', `${base}/staff`, { name: 'Ana', serviceIds: [service.id] }))
      .body;
    await api('PUT', `${base}/staff/${ana.id}/schedule`, {
      locationId: location.id,
      rules: [{ weekday: 1, start: '09:00', end: '12:00' }],
    });
    const book = (startsAt: string, extra: object = {}) =>
      api('POST', `${base}/bookings`, {
        serviceId: service.id,
        staffId: ana.id,
        locationId: location.id,
        startsAt,
        customer,
        ...extra,
      });
    const availability = async (params = '') => {
      const res = await api(
        'GET',
        `${base}/availability?serviceId=${service.id}&from=2030-01-07&to=2030-01-07${params}`,
      );
      return (res.body.slots as { start: string }[]).map((s) => s.start.slice(11, 16));
    };
    return { base, location, service, ana, book, availability };
  }

  it('reserva un horario ofrecido', async () => {
    const { book, ana, service } = await setup();
    const res = await book(NINE);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      staffId: ana.id,
      serviceId: service.id,
      startsAt: '2030-01-07T12:00:00.000Z',
      endsAt: '2030-01-07T13:00:00.000Z', // la duración, sin el margen
      status: 'confirmed',
      customer: { name: 'Juana Pérez', email: 'juana@example.com' },
    });
  });

  it('no deja reservar dentro del margen de otro turno', async () => {
    const { book } = await setup();
    expect((await book(NINE)).status).toBe(201);
    expect((await book('2030-01-07T10:00:00-03:00')).status).toBe(409); // margen hasta 10:15
    expect((await book('2030-01-07T10:15:00-03:00')).status).toBe(201);
  });

  it('no deja reservar dos veces el mismo horario', async () => {
    const { book } = await setup();
    expect((await book(NINE)).status).toBe(201);
    expect((await book(NINE)).status).toBe(409);
  });

  it('no deja reservar fuera del horario de atención', async () => {
    const { book } = await setup();
    expect((await book('2030-01-07T15:00:00-03:00')).status).toBe(409);
  });

  it('no deja reservar en un horario que no está en la grilla de 15 minutos', async () => {
    const { book } = await setup();
    expect((await book('2030-01-07T09:07:00-03:00')).status).toBe(409);
  });

  it('no deja reservar en un horario cerrado', async () => {
    const { base, book } = await setup();
    await api('POST', `${base}/closures`, {
      startsAt: '2030-01-07T00:00:00-03:00',
      endsAt: '2030-01-08T00:00:00-03:00',
      reason: 'Feriado',
    });
    expect((await book(NINE)).status).toBe(409);
  });

  it('responde 404 si el servicio es de otro negocio', async () => {
    const a = await setup();
    const b = await setup();
    expect((await a.book(NINE, { serviceId: b.service.id })).status).toBe(404);
  });

  it('valida los datos del cliente', async () => {
    const { book } = await setup();
    const res = await book(NINE, { customer: { name: '', email: 'no-es-email' } });
    expect(res.status).toBe(400);
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['customer.name', 'customer.email']));
  });

  it('lista los turnos del negocio y devuelve uno por id', async () => {
    const { base, book } = await setup();
    const a = (await book(NINE)).body;
    // El primero ocupa hasta las 10:15 con el margen: el siguiente libre es 10:15.
    const b = (await book('2030-01-07T10:15:00-03:00')).body;

    const all = await api(
      'GET',
      `${base}/bookings?from=2030-01-07T00:00:00Z&to=2030-01-08T00:00:00Z`,
    );
    expect(all.body.map((x: { id: string }) => x.id)).toEqual([a.id, b.id]);

    const later = await api('GET', `${base}/bookings?from=2030-01-07T13:10:00Z`);
    expect(later.body.map((x: { id: string }) => x.id)).toEqual([b.id]);

    expect((await api('GET', `${base}/bookings/${a.id}`)).body.id).toBe(a.id);
  });

  it('no muestra turnos de otro negocio', async () => {
    const a = await setup();
    const b = await setup();
    const booking = (await b.book(NINE)).body;
    expect((await api('GET', `${a.base}/bookings/${booking.id}`)).status).toBe(404);
  });

  describe('disponibilidad con turnos tomados', () => {
    it('saca de la oferta los horarios que pisan un turno, contando su margen', async () => {
      const { book, availability } = await setup();
      expect(await availability()).toHaveLength(9); // 09:00 a 11:00 cada 15 minutos
      await book(NINE); // ocupa de 09:00 a 10:15 con el margen
      // Horas en UTC: 10:15 local = 13:15Z.
      expect(await availability()).toEqual(['13:15', '13:30', '13:45', '14:00']);
    });

    it('un turno en otra sucursal también ocupa a la profesional', async () => {
      const { base, ana, service, book, availability } = await setup();
      const centro = (await api('POST', `${base}/locations`, { name: 'Centro' })).body;
      await api('PUT', `${base}/staff/${ana.id}/schedule`, {
        locationId: centro.id,
        rules: [{ weekday: 1, start: '09:00', end: '12:00' }],
      });
      await book(NINE, { locationId: centro.id, serviceId: service.id });
      expect(await availability()).not.toContain('12:00');
    });
  });
});
