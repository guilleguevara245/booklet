import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { integrationReady, uniqueSlug } from './helpers.js';

// Prueba la restricción directamente en la base, sin pasar por la API: aunque la
// aplicación tuviera un error, PostgreSQL no deja guardar dos turnos superpuestos.
describe.skipIf(!integrationReady)('restricción de turnos superpuestos', () => {
  let sql: postgres.Sql;
  let ids: {
    business: string;
    location: string;
    staff: string;
    otherStaff: string;
    service: string;
  };

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });
    const [b] =
      await sql`insert into businesses (slug, name) values (${uniqueSlug()}, 'Test') returning id`;
    const business = b!.id as string;
    const [l] =
      await sql`insert into locations (business_id, name) values (${business}, 'X') returning id`;
    const [s1] =
      await sql`insert into staff (business_id, name) values (${business}, 'Ana') returning id`;
    const [s2] =
      await sql`insert into staff (business_id, name) values (${business}, 'Bea') returning id`;
    const [sv] =
      await sql`insert into services (business_id, name, duration_minutes) values (${business}, 'Corte', 30) returning id`;
    ids = { business, location: l!.id, staff: s1!.id, otherStaff: s2!.id, service: sv!.id };
  });

  afterAll(async () => {
    await sql?.end();
  });

  /** Inserta un turno; `until` es el fin del margen posterior. */
  function book(staffId: string, start: string, until: string, status = 'confirmed') {
    return sql`
      insert into bookings (id, business_id, location_id, staff_id, service_id, customer_name,
        customer_email, starts_at, ends_at, blocked_until, status)
      values (${randomUUID()}, ${ids.business}, ${ids.location}, ${staffId}, ${ids.service}, 'Cliente',
        'cliente@example.com', ${start}, ${start}::timestamptz + interval '30 minutes', ${until}, ${status})`;
  }

  it('rechaza un turno que se superpone con otro del mismo profesional', async () => {
    await book(ids.staff, '2030-02-04T13:00:00Z', '2030-02-04T13:45:00Z');
    await expect(
      book(ids.staff, '2030-02-04T13:30:00Z', '2030-02-04T14:00:00Z'),
    ).rejects.toMatchObject({
      code: '23P01',
    });
  });

  it('rechaza un turno que cae dentro del margen del anterior', async () => {
    await book(ids.staff, '2030-02-05T13:00:00Z', '2030-02-05T13:45:00Z'); // margen hasta 13:45
    await expect(
      book(ids.staff, '2030-02-05T13:40:00Z', '2030-02-05T14:10:00Z'),
    ).rejects.toMatchObject({
      code: '23P01',
    });
  });

  it('permite un turno que empieza justo cuando termina el margen del anterior', async () => {
    await book(ids.staff, '2030-02-06T13:00:00Z', '2030-02-06T13:45:00Z');
    await expect(
      book(ids.staff, '2030-02-06T13:45:00Z', '2030-02-06T14:15:00Z'),
    ).resolves.toBeDefined();
  });

  it('permite el mismo horario con otro profesional', async () => {
    await book(ids.staff, '2030-02-07T13:00:00Z', '2030-02-07T13:30:00Z');
    await expect(
      book(ids.otherStaff, '2030-02-07T13:00:00Z', '2030-02-07T13:30:00Z'),
    ).resolves.toBeDefined();
  });

  it('un turno cancelado no ocupa la agenda', async () => {
    await book(ids.staff, '2030-02-08T13:00:00Z', '2030-02-08T13:30:00Z', 'cancelled');
    await expect(
      book(ids.staff, '2030-02-08T13:00:00Z', '2030-02-08T13:30:00Z'),
    ).resolves.toBeDefined();
  });

  it('no deja volver a confirmar un turno cancelado si su horario ya se ocupó', async () => {
    const [old] = await sql`
      insert into bookings (business_id, location_id, staff_id, service_id, customer_name, customer_email,
        starts_at, ends_at, blocked_until, status)
      values (${ids.business}, ${ids.location}, ${ids.staff}, ${ids.service}, 'C', 'c@example.com',
        '2030-02-11T13:00:00Z', '2030-02-11T13:30:00Z', '2030-02-11T13:30:00Z', 'cancelled')
      returning id`;
    await book(ids.staff, '2030-02-11T13:00:00Z', '2030-02-11T13:30:00Z');
    await expect(
      sql`update bookings set status = 'confirmed' where id = ${old!.id}`,
    ).rejects.toMatchObject({ code: '23P01' });
  });
});
