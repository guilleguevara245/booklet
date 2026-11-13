import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Booking, CreateBooking, ListBookingsQuery } from '@booklet/shared';
import { and, asc, eq, gt, lt, type SQL } from 'drizzle-orm';
import { AvailabilityService } from '../availability/availability.service.js';
import { BusinessesService } from '../businesses/businesses.service.js';
import { rethrowOverlap } from '../common/db-errors.js';
import { toBooking } from '../common/mappers.js';
import { DB, type Database } from '../database/database.module.js';
import { bookings } from '../database/schema.js';
import { LocationsService } from '../locations/locations.service.js';
import { ServicesService } from '../services/services.service.js';
import { StaffService } from '../staff/staff.service.js';

const MINUTE = 60_000;
export const SLOT_TAKEN = 'Ese horario ya fue tomado. Elegí otro.';
export const SLOT_NOT_OFFERED = 'Ese horario no está disponible para este servicio.';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BusinessesService) private readonly businesses: BusinessesService,
    @Inject(ServicesService) private readonly services: ServicesService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(LocationsService) private readonly locations: LocationsService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
  ) {}

  /**
   * Reserva un turno. Primero comprueba que el horario se ofrezca (horario de atención,
   * cierres, anticipación); después lo guarda. Si otra reserva ganó el horario en el medio,
   * la restricción de la base lo rechaza y se responde 409.
   */
  async create(businessId: string, input: CreateBooking, now = new Date()): Promise<Booking> {
    await this.businesses.require(businessId);
    const [service, , location] = await Promise.all([
      this.services.get(businessId, input.serviceId),
      this.staff.get(businessId, input.staffId),
      this.locations.get(businessId, input.locationId),
    ]);
    const start = new Date(input.startsAt);

    const offered = await this.availability.isOffered(
      businessId,
      { ...input, timezone: location.timezone, start },
      now,
    );
    if (!offered) throw new ConflictException(SLOT_NOT_OFFERED);

    const endsAt = new Date(start.getTime() + service.durationMinutes * MINUTE);
    try {
      const [row] = await this.db
        .insert(bookings)
        .values({
          businessId,
          locationId: input.locationId,
          staffId: input.staffId,
          serviceId: input.serviceId,
          customerName: input.customer.name,
          customerEmail: input.customer.email,
          customerPhone: input.customer.phone ?? null,
          startsAt: start,
          endsAt,
          blockedUntil: new Date(endsAt.getTime() + service.bufferMinutes * MINUTE),
        })
        .returning();
      return toBooking(row!);
    } catch (err) {
      rethrowOverlap(err, SLOT_TAKEN);
    }
  }

  async list(businessId: string, q: ListBookingsQuery = {}): Promise<Booking[]> {
    await this.businesses.require(businessId);
    const where: SQL[] = [eq(bookings.businessId, businessId)];
    if (q.from) where.push(gt(bookings.endsAt, new Date(q.from)));
    if (q.to) where.push(lt(bookings.startsAt, new Date(q.to)));
    if (q.staffId) where.push(eq(bookings.staffId, q.staffId));
    if (q.status) where.push(eq(bookings.status, q.status));
    const rows = await this.db.query.bookings.findMany({
      where: and(...where),
      orderBy: asc(bookings.startsAt),
      limit: 500,
    });
    return rows.map(toBooking);
  }

  async get(businessId: string, id: string): Promise<Booking> {
    const row = await this.db.query.bookings.findFirst({
      where: and(eq(bookings.id, id), eq(bookings.businessId, businessId)),
    });
    if (!row) throw new NotFoundException('Turno no encontrado');
    return toBooking(row);
  }
}
