import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, integrationReady, startApp, uniqueSlug } from './helpers.js';

const ATTEMPTS = 20;

// Muchas personas tocan "Reservar" al mismo tiempo. Todas pasan el chequeo de
// disponibilidad porque todavía no hay nada guardado; la restricción de la base es lo
// único que puede evitar el turno doble.
describe.skipIf(!integrationReady)('reservas simultáneas (e2e)', () => {
  let app: NestFastifyApplication;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await startApp();
    api = client(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function setup() {
    const business = (await api('POST', '/businesses', { slug: uniqueSlug(), name: 'Canchas' }))
      .body;
    const base = `/businesses/${business.id}`;
    const location = (await api('POST', `${base}/locations`, { name: 'Sede' })).body;
    const service = (
      await api('POST', `${base}/services`, { name: 'Cancha de 5', durationMinutes: 60 })
    ).body;
    const court = (
      await api('POST', `${base}/staff`, { name: 'Cancha 1', serviceIds: [service.id] })
    ).body;
    await api('PUT', `${base}/staff/${court.id}/schedule`, {
      locationId: location.id,
      rules: [{ weekday: 1, start: '18:00', end: '23:00' }],
    });
    const book = (startsAt: string, n: number) =>
      api('POST', `${base}/bookings`, {
        serviceId: service.id,
        staffId: court.id,
        locationId: location.id,
        startsAt,
        customer: { name: `Equipo ${n}`, email: `equipo${n}@example.com` },
      });
    return { base, book };
  }

  it(`de ${ATTEMPTS} reservas simultáneas al mismo horario, entra una sola`, async () => {
    const { base, book } = await setup();
    const results = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, n) => book('2030-01-07T20:00:00-03:00', n)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(ATTEMPTS - 1);

    const saved = await api('GET', `${base}/bookings?status=confirmed`);
    expect(saved.body).toHaveLength(1);
  });

  it('entre horarios distintos que se pisan, también entra uno solo', async () => {
    const { base, book } = await setup();
    // Turnos de 60 minutos a las 20:00, 20:15, 20:30 y 20:45: todos se pisan entre sí.
    const starts = ['20:00', '20:15', '20:30', '20:45'].map((t) => `2030-01-07T${t}:00-03:00`);
    const results = await Promise.all(
      Array.from({ length: ATTEMPTS }, (_, n) => book(starts[n % starts.length]!, n)),
    );
    const saved = (await api('GET', `${base}/bookings?status=confirmed`)).body as {
      startsAt: string;
      endsAt: string;
    }[];

    // Lo que haya entrado no se superpone entre sí.
    const sorted = saved.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.startsAt >= sorted[i - 1]!.endsAt).toBe(true);
    }
    expect(saved).toHaveLength(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
  });
});
