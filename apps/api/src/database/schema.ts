import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Un negocio que da turnos: una peluquería, un consultorio, un complejo de canchas. */
export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('businesses_slug_key').on(t.slug)],
);

/** Sucursal de un negocio. Cada una tiene su zona horaria: los horarios se cargan en hora local. */
export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    address: text('address'),
    timezone: text('timezone').notNull().default('America/Argentina/Buenos_Aires'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('locations_business_idx').on(t.businessId)],
);

/** Profesional que atiende: peluquera, médico, instructor. */
export const staff = pgTable(
  'staff',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('staff_business_idx').on(t.businessId)],
);

/** Servicio que se reserva. `bufferMinutes` es el tiempo libre que queda después de cada turno. */
export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    bufferMinutes: integer('buffer_minutes').notNull().default(0),
    priceCents: integer('price_cents').notNull().default(0),
    currency: text('currency').notNull().default('ARS'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('services_business_idx').on(t.businessId),
    check('services_duration_check', sql`${t.durationMinutes} between 5 and 720`),
    check('services_buffer_check', sql`${t.bufferMinutes} between 0 and 240`),
    check('services_price_check', sql`${t.priceCents} >= 0`),
  ],
);

/** Qué servicios hace cada profesional. */
export const staffServices = pgTable(
  'staff_services',
  {
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })],
);

/**
 * Horario semanal de un profesional en una sucursal. Admite varios tramos por día
 * (por ejemplo, 9 a 13 y 15 a 19). `weekday` sigue ISO 8601: 1 = lunes, 7 = domingo.
 */
export const workingHours = pgTable(
  'working_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    index('working_hours_staff_idx').on(t.staffId),
    check('working_hours_weekday_check', sql`${t.weekday} between 1 and 7`),
    check('working_hours_range_check', sql`${t.endTime} > ${t.startTime}`),
  ],
);

/**
 * Cierre o ausencia: feriado, vacaciones, un trámite. Sin sucursal ni profesional, cierra todo
 * el negocio; con sucursal, solo esa sucursal; con profesional, solo a esa persona.
 */
export const closures = pgTable(
  'closures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('closures_business_range_idx').on(t.businessId, t.startsAt),
    check('closures_range_check', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

// --- Relaciones (para las consultas con `with` de Drizzle) ---

export const staffRelations = relations(staff, ({ many }) => ({
  services: many(staffServices),
  workingHours: many(workingHours),
}));

export const staffServicesRelations = relations(staffServices, ({ one }) => ({
  staff: one(staff, { fields: [staffServices.staffId], references: [staff.id] }),
  service: one(services, { fields: [staffServices.serviceId], references: [services.id] }),
}));

export const workingHoursRelations = relations(workingHours, ({ one }) => ({
  staff: one(staff, { fields: [workingHours.staffId], references: [staff.id] }),
  location: one(locations, { fields: [workingHours.locationId], references: [locations.id] }),
}));
