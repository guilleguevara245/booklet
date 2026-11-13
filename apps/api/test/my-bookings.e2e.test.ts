import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, integrationReady, signUp, startApp, uniqueSlug, withSession } from './helpers.js';

describe.skipIf(!integrationReady)('turnos del cliente (e2e)', () => {
  let app: NestFastifyApplication;
  let anon: ReturnType<typeof client>;
  let sql: postgres.Sql;

  beforeAll(async () => {
    app = await startApp();
    anon = client(app);
    sql = postgres(process.env.DATABASE_URL!, { max: 2 });
  });

  afterAll(async () => {
    await app?.close();
    await sql?.end();
  });

  /** Negocio abierto el lunes de 9 a 12 con un servicio de 30 minutos. */
  async function setup() {
    const owner = withSession(anon, (await signUp(anon, 'Dueña')).as);
    const business = (
      await owner('POST', '/businesses', { slug: uniqueSlug(), name: 'Barbería Sur' })
    ).body;
    const base = `/businesses/${business.id}`;
    const location = (await owner('POST', `${base}/locations`, { name: 'Boedo' })).body;
    const service = (
      await owner('POST', `${base}/services`, { name: 'Barba', durationMinutes: 30 })
    ).body;
    const leo = (await owner('POST', `${base}/staff`, { name: 'Leo', serviceIds: [service.id] }))
      .body;
    await owner('PUT', `${base}/staff/${leo.id}/schedule`, {
      locationId: location.id,
      rules: [{ weekday: 1, start: '09:00', end: '12:00' }],
    });
    const booking = (time: string, email: string) => ({
      serviceId: service.id,
      staffId: leo.id,
      locationId: location.id,
      startsAt: `2030-01-07T${time}:00-03:00`,
      customer: { name: 'Juan', email },
    });
    return { base, booking };
  }

  it('muestra los turnos reservados con la sesión iniciada, con los nombres', async () => {
    const { base, booking } = await setup();
    const customer = await signUp(anon, 'Juan');
    const me = withSession(anon, customer.as);
    await me('POST', `${base}/bookings`, booking('09:00', customer.email));

    const res = await me('GET', '/me/bookings');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      business: { name: 'Barbería Sur' },
      serviceName: 'Barba',
      staffName: 'Leo',
      locationName: 'Boedo',
      startsAt: '2030-01-07T12:00:00.000Z',
    });
  });

  it('suma los turnos reservados sin cuenta solo si el email está verificado', async () => {
    const { base, booking } = await setup();
    const customer = await signUp(anon, 'Juan');
    await anon('POST', `${base}/bookings`, booking('10:00', customer.email)); // sin sesión
    const me = withSession(anon, customer.as);

    // Sin verificar el email, cualquiera podría registrarse con un email ajeno y ver sus turnos.
    expect((await me('GET', '/me/bookings')).body).toHaveLength(0);

    await sql`update users set email_verified = true where id = ${customer.user.id}`;
    expect((await me('GET', '/me/bookings')).body).toHaveLength(1);
  });

  it('deja cancelar un turno propio pero no uno ajeno', async () => {
    const { base, booking } = await setup();
    const juan = await signUp(anon, 'Juan');
    const otro = await signUp(anon, 'Otro');
    const mine = (
      await withSession(anon, juan.as)('POST', `${base}/bookings`, booking('09:00', juan.email))
    ).body;

    const stolen = await withSession(anon, otro.as)('POST', `/me/bookings/${mine.id}/cancel`);
    expect(stolen.status).toBe(404);

    const res = await withSession(anon, juan.as)('POST', `/me/bookings/${mine.id}/cancel`, {
      reason: 'Me surgió algo',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('exige sesión', async () => {
    expect((await anon('GET', '/me/bookings')).status).toBe(401);
  });
});
