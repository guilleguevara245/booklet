import type { Business, Closure, Location, Service } from '@booklet/shared';
import type { businesses, closures, locations, services } from '../database/schema.js';

// Pasan filas de la base al formato público de la API (fechas ISO, horas HH:MM).

export const toBusiness = (r: typeof businesses.$inferSelect): Business => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  createdAt: r.createdAt.toISOString(),
});

export const toLocation = (r: typeof locations.$inferSelect): Location => ({
  id: r.id,
  businessId: r.businessId,
  name: r.name,
  address: r.address,
  timezone: r.timezone,
  active: r.active,
});

export const toService = (r: typeof services.$inferSelect): Service => ({
  id: r.id,
  businessId: r.businessId,
  name: r.name,
  durationMinutes: r.durationMinutes,
  bufferMinutes: r.bufferMinutes,
  priceCents: r.priceCents,
  currency: r.currency,
  active: r.active,
});

export const toClosure = (r: typeof closures.$inferSelect): Closure => ({
  id: r.id,
  businessId: r.businessId,
  locationId: r.locationId,
  staffId: r.staffId,
  startsAt: r.startsAt.toISOString(),
  endsAt: r.endsAt.toISOString(),
  reason: r.reason,
});

/** `09:00:00` → `09:00` */
export const hhmm = (time: string) => time.slice(0, 5);
