import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { integrationReady } from './helpers.js';

// Reglas de las tablas de cuentas que garantiza la propia base de datos.
describe.skipIf(!integrationReady)('tablas de cuentas', () => {
  let sql: postgres.Sql;
  const email = () => `persona-${randomUUID().slice(0, 8)}@example.com`;

  beforeAll(() => {
    sql = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
  });

  afterAll(async () => {
    await sql?.end();
  });

  it('exige el email en minúsculas', async () => {
    await expect(
      sql`insert into users (email, name) values ('Ana@Example.com', 'Ana')`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('no permite dos cuentas con el mismo email', async () => {
    const e = email();
    await sql`insert into users (email, name) values (${e}, 'Ana')`;
    await expect(sql`insert into users (email, name) values (${e}, 'Otra')`).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('al borrar una cuenta se borran sus sesiones', async () => {
    const [user] =
      await sql`insert into users (email, name) values (${email()}, 'Ana') returning id`;
    await sql`insert into sessions (user_id, token_hash, expires_at)
      values (${user!.id}, ${randomUUID()}, now() + interval '1 day')`;
    await sql`delete from users where id = ${user!.id}`;
    const [{ count }] =
      (await sql`select count(*)::int as count from sessions where user_id = ${user!.id}`) as unknown as [
        { count: number },
      ];
    expect(count).toBe(0);
  });
});
