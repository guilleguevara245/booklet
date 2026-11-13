import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AvailabilityQuery, AvailabilityResponse, AvailableSlot } from '@booklet/shared';
import { and, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { BusinessesService } from '../businesses/businesses.service.js';
import { DB, type Database } from '../database/database.module.js';
import {
  bookings,
  closures,
  locations,
  staff,
  staffServices,
  workingHours,
} from '../database/schema.js';
import { ServicesService } from '../services/services.service.js';
import { computeSlots, type WeeklyRule } from './compute.js';

/** Cada cuántos minutos puede empezar un turno. */
export const SLOT_STEP_MINUTES = 15;
/** Anticipación mínima para reservar. */
export const MIN_LEAD_MINUTES = 60;

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BusinessesService) private readonly businesses: BusinessesService,
    @Inject(ServicesService) private readonly services: ServicesService,
  ) {}

  /**
   * `ignoreBookingId` deja afuera un turno al calcular: al reprogramarlo, su horario actual
   * no debe impedir moverlo a uno cercano.
   */
  async find(
    businessId: string,
    q: AvailabilityQuery,
    now = new Date(),
    opts: { ignoreBookingId?: string } = {},
  ): Promise<AvailabilityResponse> {
    await this.businesses.require(businessId);
    const service = await this.services.get(businessId, q.serviceId);
    if (!service.active) throw new BadRequestException('El servicio no está disponible');

    // Horarios de los profesionales activos que hacen el servicio, en sucursales activas.
    const rows = await this.db
      .select({
        staffId: workingHours.staffId,
        locationId: workingHours.locationId,
        timezone: locations.timezone,
        weekday: workingHours.weekday,
        start: workingHours.startTime,
        end: workingHours.endTime,
      })
      .from(workingHours)
      .innerJoin(staff, eq(staff.id, workingHours.staffId))
      .innerJoin(staffServices, eq(staffServices.staffId, staff.id))
      .innerJoin(locations, eq(locations.id, workingHours.locationId))
      .where(
        and(
          eq(staff.businessId, businessId),
          eq(staff.active, true),
          eq(locations.businessId, businessId),
          eq(locations.active, true),
          eq(staffServices.serviceId, service.id),
          q.staffId ? eq(staff.id, q.staffId) : undefined,
          q.locationId ? eq(locations.id, q.locationId) : undefined,
        ),
      );

    const groups = new Map<
      string,
      { staffId: string; locationId: string; timezone: string; rules: WeeklyRule[] }
    >();
    for (const r of rows) {
      const key = `${r.staffId}:${r.locationId}`;
      const group = groups.get(key) ?? {
        staffId: r.staffId,
        locationId: r.locationId,
        timezone: r.timezone,
        rules: [],
      };
      group.rules.push({ weekday: r.weekday, start: r.start, end: r.end });
      groups.set(key, group);
    }

    // Cierres que tocan el rango. Se amplía un día por lado para cubrir cualquier zona horaria.
    const rangeStart = DateTime.fromISO(q.from, { zone: 'utc' }).minus({ days: 1 }).toJSDate();
    const rangeEnd = DateTime.fromISO(q.to, { zone: 'utc' }).plus({ days: 2 }).toJSDate();
    const staffIds = [...new Set(rows.map((r) => r.staffId))];
    const closureRows =
      staffIds.length === 0
        ? []
        : await this.db
            .select()
            .from(closures)
            .where(
              and(
                eq(closures.businessId, businessId),
                lt(closures.startsAt, rangeEnd),
                gt(closures.endsAt, rangeStart),
              ),
            );

    // Turnos confirmados de esos profesionales, en cualquier sucursal: nadie atiende en dos
    // lugares a la vez. Cada turno ocupa hasta el fin de su margen.
    const bookingRows =
      staffIds.length === 0
        ? []
        : await this.db
            .select({
              staffId: bookings.staffId,
              start: bookings.startsAt,
              end: bookings.blockedUntil,
            })
            .from(bookings)
            .where(
              and(
                inArray(bookings.staffId, staffIds),
                eq(bookings.status, 'confirmed'),
                opts.ignoreBookingId ? ne(bookings.id, opts.ignoreBookingId) : undefined,
                lt(bookings.startsAt, rangeEnd),
                gt(bookings.blockedUntil, rangeStart),
              ),
            );

    const notBefore = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);
    const slots: AvailableSlot[] = [];
    for (const g of groups.values()) {
      const blocked = closureRows
        .filter(
          (c) =>
            (c.locationId === null || c.locationId === g.locationId) &&
            (c.staffId === null || c.staffId === g.staffId),
        )
        .map((c) => ({ start: c.startsAt, end: c.endsAt }))
        .concat(bookingRows.filter((b) => b.staffId === g.staffId));
      const starts = computeSlots({
        timezone: g.timezone,
        from: q.from,
        to: q.to,
        rules: g.rules,
        blocked,
        durationMinutes: service.durationMinutes,
        bufferMinutes: service.bufferMinutes,
        stepMinutes: SLOT_STEP_MINUTES,
        notBefore,
      });
      for (const start of starts) {
        slots.push({
          start: start.toISOString(),
          end: new Date(start.getTime() + service.durationMinutes * 60_000).toISOString(),
          staffId: g.staffId,
          locationId: g.locationId,
        });
      }
    }
    slots.sort((a, b) => a.start.localeCompare(b.start) || a.staffId.localeCompare(b.staffId));

    return { serviceId: service.id, from: q.from, to: q.to, slots };
  }

  /**
   * Indica si `start` es uno de los horarios que se ofrecen para ese servicio, profesional y
   * sucursal. Se usa al reservar, así un turno solo puede tomarse en un horario válido.
   */
  async isOffered(
    businessId: string,
    p: { serviceId: string; staffId: string; locationId: string; timezone: string; start: Date },
    now = new Date(),
    opts: { ignoreBookingId?: string } = {},
  ): Promise<boolean> {
    const day = DateTime.fromJSDate(p.start, { zone: p.timezone }).toISODate()!;
    const { slots } = await this.find(
      businessId,
      { serviceId: p.serviceId, staffId: p.staffId, locationId: p.locationId, from: day, to: day },
      now,
      opts,
    );
    const wanted = p.start.toISOString();
    return slots.some((s) => s.start === wanted);
  }
}
