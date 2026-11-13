import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, integrationReady, signUp, startApp, uniqueSlug, withSession } from './helpers.js';

const NINE = '2030-01-07T09:00:00-03:00';

describe.skipIf(!integrationReady)('roles y permisos (e2e)', () => {
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

  /** Negocio armado por su dueña, listo para recibir reservas el lunes de 9 a 12. */
  async function setup() {
    const ownerAccount = await signUp(anon, 'Dueña');
    const owner = withSession(anon, ownerAccount.as);
    const business = (await owner('POST', '/businesses', { slug: uniqueSlug(), name: 'Estudio' }))
      .body;
    const base = `/businesses/${business.id}`;
    const location = (await owner('POST', `${base}/locations`, { name: 'Centro' })).body;
    const service = (
      await owner('POST', `${base}/services`, { name: 'Clase', durationMinutes: 60 })
    ).body;
    const ana = (await owner('POST', `${base}/staff`, { name: 'Ana', serviceIds: [service.id] }))
      .body;
    await owner('PUT', `${base}/staff/${ana.id}/schedule`, {
      locationId: location.id,
      rules: [{ weekday: 1, start: '09:00', end: '12:00' }],
    });
    const booking = {
      serviceId: service.id,
      staffId: ana.id,
      locationId: location.id,
      startsAt: NINE,
      customer: { name: 'Juana', email: 'juana@example.com' },
    };
    return { owner, ownerAccount, business, base, service, booking };
  }

  it('crear un negocio exige sesión, y quien lo crea queda como dueña', async () => {
    const res = await anon('POST', '/businesses', { slug: uniqueSlug(), name: 'X' });
    expect(res.status).toBe(401);

    const { owner, business } = await setup();
    const me = await owner('GET', '/auth/me');
    expect(me.body.memberships).toContainEqual({
      businessId: business.id,
      slug: business.slug,
      name: 'Estudio',
      role: 'owner',
    });
  });

  describe('sin sesión', () => {
    it('puede ver el catálogo, consultar turnos libres y reservar', async () => {
      const { base, service, booking } = await setup();
      expect((await anon('GET', `${base}/services`)).status).toBe(200);
      expect((await anon('GET', `${base}/staff`)).status).toBe(200);
      const free = await anon(
        'GET',
        `${base}/availability?serviceId=${service.id}&from=2030-01-07&to=2030-01-07`,
      );
      expect(free.status).toBe(200);
      expect((await anon('POST', `${base}/bookings`, booking)).status).toBe(201);
    });

    it('no puede ver los turnos ni modificar el negocio', async () => {
      const { base } = await setup();
      expect((await anon('GET', `${base}/bookings`)).status).toBe(401);
      expect(
        (await anon('POST', `${base}/services`, { name: 'X', durationMinutes: 30 })).status,
      ).toBe(401);
      expect((await anon('GET', `${base}/closures`)).status).toBe(401);
    });
  });

  describe('con sesión pero sin ser del negocio', () => {
    it('recibe 403 al intentar administrar un negocio ajeno', async () => {
      const { base } = await setup();
      const stranger = withSession(anon, (await signUp(anon, 'Extraña')).as);
      expect((await stranger('PATCH', base, { name: 'Robado' })).status).toBe(403);
      expect(
        (await stranger('POST', `${base}/services`, { name: 'X', durationMinutes: 30 })).status,
      ).toBe(403);
      expect((await stranger('GET', `${base}/bookings`)).status).toBe(403);
    });
  });

  describe('con rol de staff', () => {
    it('gestiona turnos pero no el catálogo', async () => {
      const { base, business, booking, owner } = await setup();
      const staffAccount = await signUp(anon, 'Empleado');
      // Las invitaciones llegan en el próximo commit; acá se lo agrega directo en la base.
      await sql`insert into memberships (business_id, user_id, role)
        values (${business.id}, ${staffAccount.user.id}, 'staff')`;
      const staff = withSession(anon, staffAccount.as);

      const created = (await owner('POST', `${base}/bookings`, booking)).body;
      expect((await staff('GET', `${base}/bookings`)).status).toBe(200);
      expect((await staff('POST', `${base}/bookings/${created.id}/cancel`)).status).toBe(200);
      expect(
        (await staff('POST', `${base}/services`, { name: 'X', durationMinutes: 30 })).status,
      ).toBe(403);
      expect((await staff('PATCH', base, { name: 'Otro nombre' })).status).toBe(403);
    });
  });

  it('las apps nativas usan el token como Bearer con los mismos permisos', async () => {
    const { base, ownerAccount } = await setup();
    const login = await anon(
      'POST',
      '/auth/login',
      { email: ownerAccount.email, password: 'contraseña segura' },
      { 'x-booklet-client': 'native' },
    );
    const bearer = { authorization: `Bearer ${login.body.token}` };
    expect((await anon('GET', `${base}/bookings`, undefined, bearer)).status).toBe(200);
  });
});
