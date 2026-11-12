import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, integrationReady, startApp, uniqueSlug } from './helpers.js';

// 2030-01-07 es lunes. Buenos Aires es UTC-3, así que 09:00 local = 12:00Z.
const MONDAY = '2030-01-07';

describe.skipIf(!integrationReady)('disponibilidad (e2e)', () => {
  let app: NestFastifyApplication;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await startApp();
    api = client(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Negocio con una sucursal, un servicio de 60 minutos y una profesional que atiende lunes 9 a 11. */
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
    const availability = (params = '') =>
      api(
        'GET',
        `${base}/availability?serviceId=${service.id}&from=${MONDAY}&to=${MONDAY}${params}`,
      );
    return { business, base, location, service, ana, availability };
  }

  it('ofrece los turnos del horario cada 15 minutos', async () => {
    const { availability, ana, location } = await setup();
    const res = await availability();
    expect(res.status).toBe(200);
    expect(res.body.slots.map((s: { start: string }) => s.start)).toEqual([
      '2030-01-07T12:00:00.000Z',
      '2030-01-07T12:15:00.000Z',
      '2030-01-07T12:30:00.000Z',
      '2030-01-07T12:45:00.000Z',
      '2030-01-07T13:00:00.000Z',
    ]);
    expect(res.body.slots[0]).toMatchObject({
      end: '2030-01-07T13:00:00.000Z',
      staffId: ana.id,
      locationId: location.id,
    });
  });

  it('descuenta un cierre de todo el negocio y lo devuelve al borrarlo', async () => {
    const { base, availability } = await setup();
    const closure = await api('POST', `${base}/closures`, {
      startsAt: '2030-01-07T10:00:00-03:00',
      endsAt: '2030-01-07T10:30:00-03:00',
      reason: 'Corte de luz',
    });
    expect(closure.status).toBe(201);
    const starts = (await availability()).body.slots.map((s: { start: string }) => s.start);
    expect(starts).toEqual(['2030-01-07T12:00:00.000Z']); // solo 09:00 termina antes del cierre

    expect((await api('DELETE', `${base}/closures/${closure.body.id}`)).status).toBe(204);
    expect((await availability()).body.slots).toHaveLength(5);
  });

  it('la ausencia de una profesional no afecta a las demás', async () => {
    const { base, location, service, ana, availability } = await setup();
    const bea = (await api('POST', `${base}/staff`, { name: 'Bea', serviceIds: [service.id] }))
      .body;
    await api('PUT', `${base}/staff/${bea.id}/schedule`, {
      locationId: location.id,
      rules: [{ weekday: 1, start: '09:00', end: '11:00' }],
    });
    await api('POST', `${base}/closures`, {
      staffId: ana.id,
      startsAt: '2030-01-07T00:00:00-03:00',
      endsAt: '2030-01-08T00:00:00-03:00',
      reason: 'Vacaciones',
    });
    const slots = (await availability()).body.slots as { staffId: string }[];
    expect(slots.length).toBe(5);
    expect(slots.every((s) => s.staffId === bea.id)).toBe(true);
  });

  it('no ofrece turnos de profesionales dados de baja', async () => {
    const { base, ana, availability } = await setup();
    await api('PATCH', `${base}/staff/${ana.id}`, { active: false });
    expect((await availability()).body.slots).toEqual([]);
  });

  it('no ofrece turnos de un profesional que no hace el servicio', async () => {
    const { base, ana, availability } = await setup();
    await api('PUT', `${base}/staff/${ana.id}/services`, { serviceIds: [] });
    expect((await availability()).body.slots).toEqual([]);
  });

  it('respeta la zona horaria de la sucursal', async () => {
    const { base, ana, service } = await setup();
    const madrid = (
      await api('POST', `${base}/locations`, { name: 'Madrid', timezone: 'Europe/Madrid' })
    ).body;
    await api('PUT', `${base}/staff/${ana.id}/schedule`, {
      locationId: madrid.id,
      rules: [{ weekday: 1, start: '09:00', end: '10:00' }],
    });
    const res = await api(
      'GET',
      `${base}/availability?serviceId=${service.id}&from=${MONDAY}&to=${MONDAY}&locationId=${madrid.id}`,
    );
    // Enero en Madrid es UTC+1: 09:00 local = 08:00Z.
    expect(res.body.slots.map((s: { start: string }) => s.start)).toEqual([
      '2030-01-07T08:00:00.000Z',
    ]);
  });

  it('limita la consulta a 31 días', async () => {
    const { base, service } = await setup();
    const res = await api(
      'GET',
      `${base}/availability?serviceId=${service.id}&from=2030-01-01&to=2030-03-01`,
    );
    expect(res.status).toBe(400);
  });
});
