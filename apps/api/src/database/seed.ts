import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hashPassword } from '../auth/password.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';

export const DEMO_SLUG = 'peluqueria-demo';
/** Cuenta de la dueña del negocio de ejemplo. Solo para desarrollo local. */
export const DEMO_OWNER = { email: 'demo@booklet.local', password: 'demo-booklet' };

/**
 * Carga un negocio de ejemplo para desarrollo: una sucursal, tres servicios, dos
 * profesionales con horario partido y una cuenta de dueña. Si ya existe, no hace nada.
 */
export async function seed(databaseUrl: string): Promise<string> {
  await runMigrations(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });
  try {
    const existing = await db.query.businesses.findFirst({
      where: eq(schema.businesses.slug, DEMO_SLUG),
    });
    if (existing) return existing.id;

    return await db.transaction(async (tx) => {
      const [business] = await tx
        .insert(schema.businesses)
        .values({ slug: DEMO_SLUG, name: 'Peluquería Demo' })
        .returning();
      const [owner] = await tx
        .insert(schema.users)
        .values({
          email: DEMO_OWNER.email,
          name: 'Dueña Demo',
          passwordHash: await hashPassword(DEMO_OWNER.password),
          emailVerified: true,
        })
        .onConflictDoUpdate({ target: schema.users.email, set: { name: 'Dueña Demo' } })
        .returning();
      await tx
        .insert(schema.memberships)
        .values({ businessId: business!.id, userId: owner!.id, role: 'owner' });
      const [location] = await tx
        .insert(schema.locations)
        .values({ businessId: business!.id, name: 'Palermo', address: 'Av. Santa Fe 3800, CABA' })
        .returning();
      const services = await tx
        .insert(schema.services)
        .values([
          { businessId: business!.id, name: 'Corte', durationMinutes: 30, priceCents: 1_500_000 },
          {
            businessId: business!.id,
            name: 'Corte y barba',
            durationMinutes: 45,
            priceCents: 2_200_000,
          },
          {
            businessId: business!.id,
            name: 'Color',
            durationMinutes: 120,
            bufferMinutes: 15,
            priceCents: 4_800_000,
          },
        ])
        .returning();
      const people = await tx
        .insert(schema.staff)
        .values([
          { businessId: business!.id, name: 'Ana' },
          { businessId: business!.id, name: 'Bruno' },
        ])
        .returning();

      // Ana hace todo; Bruno, cortes y barba.
      await tx
        .insert(schema.staffServices)
        .values([
          ...services.map((s) => ({ staffId: people[0]!.id, serviceId: s.id })),
          { staffId: people[1]!.id, serviceId: services[0]!.id },
          { staffId: people[1]!.id, serviceId: services[1]!.id },
        ]);

      // Martes a sábado, de 10 a 14 y de 15 a 19.
      const rules = [2, 3, 4, 5, 6].flatMap((weekday) => [
        { weekday, startTime: '10:00', endTime: '14:00' },
        { weekday, startTime: '15:00', endTime: '19:00' },
      ]);
      await tx
        .insert(schema.workingHours)
        .values(
          people.flatMap((p) =>
            rules.map((r) => ({ ...r, staffId: p.id, locationId: location!.id })),
          ),
        );
      return business!.id;
    });
  } finally {
    await sql.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  const id = await seed(url);
  console.log(`Negocio de ejemplo listo: ${DEMO_SLUG} (${id})`);
  console.log(`Dueña: ${DEMO_OWNER.email} / ${DEMO_OWNER.password}`);
}
