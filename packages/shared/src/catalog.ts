import { z } from 'zod';

// Esquemas de entrada y salida del catálogo: negocios, sucursales, profesionales,
// servicios, horarios y cierres. La API los usa para validar y los clientes para tipar.

const id = z.uuid({ error: 'Debe ser un UUID' });
const name = z.string().trim().min(1, 'No puede estar vacío').max(120);

export const slugSchema = z
  .string()
  .min(3, 'Mínimo 3 caracteres')
  .max(60, 'Máximo 60 caracteres')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones');

export const timezoneSchema = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { error: 'Zona horaria desconocida' },
);

/** Hora del día, `HH:MM` de 00:00 a 24:00. */
export const timeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'Formato HH:MM');

/** Fecha local, `YYYY-MM-DD`. */
export const localDateSchema = z.iso.date({ error: 'Formato YYYY-MM-DD' });

// --- Negocios ---

export const createBusinessSchema = z.object({ slug: slugSchema, name });
export const updateBusinessSchema = z.object({ name }).partial();
export type CreateBusiness = z.infer<typeof createBusinessSchema>;
export type UpdateBusiness = z.infer<typeof updateBusinessSchema>;

export interface Business {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
}

// --- Sucursales ---

export const createLocationSchema = z.object({
  name,
  address: z.string().trim().max(200).nullish(),
  timezone: timezoneSchema.default('America/Argentina/Buenos_Aires'),
});
export const updateLocationSchema = z
  .object({
    name,
    address: z.string().trim().max(200).nullable(),
    timezone: timezoneSchema,
    active: z.boolean(),
  })
  .partial();
export type CreateLocation = z.infer<typeof createLocationSchema>;
export type UpdateLocation = z.infer<typeof updateLocationSchema>;

export interface Location {
  id: string;
  businessId: string;
  name: string;
  address: string | null;
  timezone: string;
  active: boolean;
}

// --- Servicios ---

const serviceFields = {
  name,
  durationMinutes: z.number().int().min(5, 'Mínimo 5 minutos').max(720, 'Máximo 12 horas'),
  bufferMinutes: z.number().int().min(0).max(240),
  priceCents: z.number().int().min(0),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Código ISO 4217, por ejemplo ARS'),
};

export const createServiceSchema = z.object({
  ...serviceFields,
  bufferMinutes: serviceFields.bufferMinutes.default(0),
  priceCents: serviceFields.priceCents.default(0),
  currency: serviceFields.currency.default('ARS'),
});
export const updateServiceSchema = z.object({ ...serviceFields, active: z.boolean() }).partial();
export type CreateService = z.infer<typeof createServiceSchema>;
export type UpdateService = z.infer<typeof updateServiceSchema>;

export interface Service {
  id: string;
  businessId: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  currency: string;
  active: boolean;
}

// --- Profesionales ---

const serviceIds = z
  .array(id)
  .max(200)
  .transform((ids) => [...new Set(ids)]);

export const createStaffSchema = z.object({ name, serviceIds: serviceIds.default([]) });
export const updateStaffSchema = z.object({ name, active: z.boolean() }).partial();
export const setStaffServicesSchema = z.object({ serviceIds });
export type CreateStaff = z.infer<typeof createStaffSchema>;
export type UpdateStaff = z.infer<typeof updateStaffSchema>;
export type SetStaffServices = z.infer<typeof setStaffServicesSchema>;

export interface Staff {
  id: string;
  businessId: string;
  name: string;
  active: boolean;
  serviceIds: string[];
}

// --- Horario semanal ---

export const weeklyRuleSchema = z
  .object({
    /** ISO 8601: 1 = lunes, 7 = domingo. */
    weekday: z.number().int().min(1).max(7),
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  .refine((r) => r.end > r.start, { error: 'El fin debe ser posterior al inicio', path: ['end'] });

/** Reemplaza el horario de un profesional en una sucursal. Una lista vacía lo borra. */
export const setScheduleSchema = z.object({
  locationId: id,
  rules: z.array(weeklyRuleSchema).max(70),
});
export type WeeklyRuleInput = z.infer<typeof weeklyRuleSchema>;
export type SetSchedule = z.infer<typeof setScheduleSchema>;

export interface ScheduleRule {
  locationId: string;
  weekday: number;
  start: string;
  end: string;
}

// --- Cierres y ausencias ---

export const createClosureSchema = z
  .object({
    startsAt: z.iso.datetime({ offset: true, error: 'Fecha y hora ISO 8601 con zona' }),
    endsAt: z.iso.datetime({ offset: true, error: 'Fecha y hora ISO 8601 con zona' }),
    locationId: id.nullish(),
    staffId: id.nullish(),
    reason: z.string().trim().max(200).nullish(),
  })
  .refine((c) => new Date(c.endsAt) > new Date(c.startsAt), {
    error: 'El fin debe ser posterior al inicio',
    path: ['endsAt'],
  });
export const listClosuresQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type CreateClosure = z.infer<typeof createClosureSchema>;

export interface Closure {
  id: string;
  businessId: string;
  locationId: string | null;
  staffId: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

// --- Disponibilidad ---

export const MAX_AVAILABILITY_DAYS = 31;

export const availabilityQuerySchema = z
  .object({
    serviceId: id,
    from: localDateSchema,
    to: localDateSchema,
    staffId: id.optional(),
    locationId: id.optional(),
  })
  .refine((q) => q.to >= q.from, {
    error: '`to` debe ser igual o posterior a `from`',
    path: ['to'],
  })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < MAX_AVAILABILITY_DAYS, {
    error: `Máximo ${MAX_AVAILABILITY_DAYS} días por consulta`,
    path: ['to'],
  });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export interface AvailableSlot {
  start: string;
  end: string;
  staffId: string;
  locationId: string;
}

export interface AvailabilityResponse {
  serviceId: string;
  from: string;
  to: string;
  slots: AvailableSlot[];
}
