import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
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
    /** Cuenta de la persona, si aceptó una invitación vinculada a este profesional. */
    userId: uuid('user_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('staff_business_idx').on(t.businessId),
    uniqueIndex('staff_business_user_key').on(t.businessId, t.userId),
  ],
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

/** Estado de un turno. Solo los confirmados ocupan la agenda. */
export const bookingStatus = pgEnum('booking_status', ['confirmed', 'cancelled']);

/**
 * Turno reservado. `blockedUntil` es el fin del turno más el margen del servicio: la agenda
 * del profesional queda ocupada hasta ese momento.
 *
 * La migración 0002 agrega una restricción de exclusión: dos turnos confirmados del mismo
 * profesional no pueden superponerse. La base de datos lo garantiza aunque lleguen dos
 * reservas al mismo tiempo.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'restrict' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    customerName: text('customer_name').notNull(),
    customerEmail: text('customer_email').notNull(),
    customerPhone: text('customer_phone'),
    /** Cuenta de quien reservó, si reservó con la sesión iniciada. */
    customerUserId: uuid('customer_user_id').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }).notNull(),
    status: bookingStatus('status').notNull().default('confirmed'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    /**
     * Hash del token del link "gestionar mi turno" que va en los mails: con él, quien reservó
     * cancela o reprograma sin cuenta. Como con las sesiones, el token no se guarda.
     */
    manageTokenHash: text('manage_token_hash'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_business_starts_idx').on(t.businessId, t.startsAt),
    index('bookings_staff_starts_idx').on(t.staffId, t.startsAt),
    index('bookings_customer_user_idx').on(t.customerUserId),
    index('bookings_customer_email_idx').on(t.customerEmail),
    uniqueIndex('bookings_manage_token_key').on(t.manageTokenHash),
    check('bookings_range_check', sql`${t.endsAt} > ${t.startsAt}`),
    check('bookings_blocked_check', sql`${t.blockedUntil} >= ${t.endsAt}`),
  ],
);

// --- Cuentas ---

/**
 * Persona con cuenta: dueño, empleado o cliente. El email se guarda en minúsculas. Puede
 * entrar con contraseña, con Google o con las dos; `passwordHash` y `googleSub` son opcionales.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    googleSub: text('google_sub'),
    emailVerified: boolean('email_verified').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_google_sub_key').on(t.googleSub),
    check('users_email_lower_check', sql`${t.email} = lower(${t.email})`),
  ],
);

/**
 * Sesión iniciada. Se guarda el hash SHA-256 del token, nunca el token: si alguien lee la
 * base, no puede usar las sesiones.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

/** Rol de una persona dentro de un negocio. */
export const memberRole = pgEnum('member_role', ['owner', 'staff']);

/** Quién puede administrar cada negocio y con qué rol. */
export const memberships = pgTable(
  'memberships',
  {
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.businessId, t.userId] }),
    index('memberships_user_idx').on(t.userId),
  ],
);

/**
 * Invitación para sumarse al equipo de un negocio. Como las sesiones, guarda solo el hash
 * del token. Con `staffId`, al aceptarla la cuenta queda vinculada a ese profesional.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: memberRole('role').notNull(),
    staffId: uuid('staff_id').references(() => staff.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_key').on(t.tokenHash),
    index('invitations_business_idx').on(t.businessId),
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
