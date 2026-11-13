import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AvailableSlot,
  Booking,
  CancelBooking,
  CreateBooking,
  ListBookingsQuery,
  MyBooking,
  RescheduleBooking,
} from '@booklet/shared';
import { and, asc, desc, eq, gt, lt, or, sql, type SQL } from 'drizzle-orm';
import { AvailabilityService } from '../availability/availability.service.js';
import { BookingEvents } from '../realtime/booking-events.js';
import { BusinessesService } from '../businesses/businesses.service.js';
import { rethrowOverlap } from '../common/db-errors.js';
import { toBooking } from '../common/mappers.js';
import { DB, type Database } from '../database/database.module.js';
import type { SessionUser } from '../auth/sessions.service.js';
import { bookings, businesses, locations, services, staff } from '../database/schema.js';
import { LocationsService } from '../locations/locations.service.js';
import { ServicesService } from '../services/services.service.js';
import { StaffService } from '../staff/staff.service.js';

const MINUTE = 60_000;

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Pone en fila las escrituras sobre la agenda de un mismo profesional hasta que termine la
 * transacción. Sin esto, dos reservas simultáneas de horarios distintos que se pisan pueden
 * trabarse entre sí al chequear la restricción de exclusión (PostgreSQL responde "deadlock
 * detected"). Con la fila, la segunda espera a la primera y recibe un 409 limpio. La
 * restricción sigue siendo la garantía; esto solo evita el bloqueo mutuo.
 */
async function lockStaffAgenda(tx: Tx, staffId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${staffId}, 0))`);
}
export const SLOT_TAKEN = 'Ese horario ya fue tomado. Elegí otro.';
export const SLOT_NOT_OFFERED = 'Ese horario no está disponible para este servicio.';
export const ALREADY_CANCELLED = 'El turno ya estaba cancelado.';
export const ALREADY_STARTED = 'El turno ya empezó o ya pasó: no se puede modificar.';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BusinessesService) private readonly businesses: BusinessesService,
    @Inject(ServicesService) private readonly services: ServicesService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(LocationsService) private readonly locations: LocationsService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
    @Inject(BookingEvents) private readonly events: BookingEvents,
  ) {}

  /**
   * Reserva un turno. Primero comprueba que el horario se ofrezca (horario de atención,
   * cierres, anticipación); después lo guarda. Si otra reserva ganó el horario en el medio,
   * la restricción de la base lo rechaza y se responde 409.
   */
  /** `customerUserId`: quien reserva con la sesión iniciada queda vinculado al turno. */
  async create(
    businessId: string,
    input: CreateBooking,
    now = new Date(),
    customerUserId: string | null = null,
  ): Promise<Booking> {
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
      const row = await this.db.transaction(async (tx) => {
        await lockStaffAgenda(tx, input.staffId);
        const [inserted] = await tx
          .insert(bookings)
          .values({
            businessId,
            locationId: input.locationId,
            staffId: input.staffId,
            serviceId: input.serviceId,
            customerName: input.customer.name,
            customerEmail: input.customer.email,
            customerPhone: input.customer.phone ?? null,
            customerUserId,
            startsAt: start,
            endsAt,
            blockedUntil: new Date(endsAt.getTime() + service.bufferMinutes * MINUTE),
          })
          .returning();
        return inserted!;
      });
      const booking = toBooking(row);
      this.events.publish('booking.created', booking);
      return booking;
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

  /** Cancela un turno confirmado que todavía no empezó. Libera su horario al instante. */
  async cancel(
    businessId: string,
    id: string,
    input: CancelBooking,
    now = new Date(),
  ): Promise<Booking> {
    const current = await this.get(businessId, id);
    this.assertModifiable(current, now);
    const [row] = await this.db
      .update(bookings)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelReason: input.reason ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(bookings.id, id),
          eq(bookings.businessId, businessId),
          eq(bookings.status, 'confirmed'),
        ),
      )
      .returning();
    // Si otra cancelación ganó en el medio, la condición sobre el estado no encuentra la fila.
    if (!row) throw new ConflictException(ALREADY_CANCELLED);
    const booking = toBooking(row);
    this.events.publish('booking.cancelled', booking);
    return booking;
  }

  /**
   * Mueve un turno a otro horario, y si se pide, a otro profesional o sucursal. El horario
   * actual del turno no cuenta como ocupado, así que se lo puede correr unos minutos.
   */
  async reschedule(
    businessId: string,
    id: string,
    input: RescheduleBooking,
    now = new Date(),
  ): Promise<Booking> {
    const current = await this.get(businessId, id);
    this.assertModifiable(current, now);
    const staffId = input.staffId ?? current.staffId;
    const locationId = input.locationId ?? current.locationId;
    const [service, , location] = await Promise.all([
      this.services.get(businessId, current.serviceId),
      this.staff.get(businessId, staffId),
      this.locations.get(businessId, locationId),
    ]);
    const start = new Date(input.startsAt);

    const offered = await this.availability.isOffered(
      businessId,
      { serviceId: service.id, staffId, locationId, timezone: location.timezone, start },
      now,
      { ignoreBookingId: id },
    );
    if (!offered) throw new ConflictException(SLOT_NOT_OFFERED);

    const endsAt = new Date(start.getTime() + service.durationMinutes * MINUTE);
    try {
      const row = await this.db.transaction(async (tx) => {
        // Siempre en el mismo orden, para que dos reprogramaciones cruzadas no se traben.
        for (const s of [...new Set([current.staffId, staffId])].sort()) {
          await lockStaffAgenda(tx, s);
        }
        const [updated] = await tx
          .update(bookings)
          .set({
            staffId,
            locationId,
            startsAt: start,
            endsAt,
            blockedUntil: new Date(endsAt.getTime() + service.bufferMinutes * MINUTE),
            updatedAt: now,
          })
          .where(
            and(
              eq(bookings.id, id),
              eq(bookings.businessId, businessId),
              eq(bookings.status, 'confirmed'),
            ),
          )
          .returning();
        return updated;
      });
      if (!row) throw new ConflictException(ALREADY_CANCELLED);
      const booking = toBooking(row);
      this.events.publish('booking.rescheduled', booking);
      return booking;
    } catch (err) {
      rethrowOverlap(err, SLOT_TAKEN);
    }
  }

  /**
   * Turnos de una persona: los que reservó con su cuenta y, si su email está verificado,
   * también los que reservó con ese email antes de tener cuenta.
   */
  async listMine(user: SessionUser): Promise<MyBooking[]> {
    const rows = await this.db
      .select({
        booking: bookings,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        serviceName: services.name,
        staffName: staff.name,
        locationName: locations.name,
        locationTimezone: locations.timezone,
      })
      .from(bookings)
      .innerJoin(businesses, eq(businesses.id, bookings.businessId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(staff, eq(staff.id, bookings.staffId))
      .innerJoin(locations, eq(locations.id, bookings.locationId))
      .where(this.ownedBy(user))
      .orderBy(desc(bookings.startsAt))
      .limit(200);
    return rows.map((r) => ({
      ...toBooking(r.booking),
      business: { name: r.businessName, slug: r.businessSlug },
      serviceName: r.serviceName,
      staffName: r.staffName,
      locationName: r.locationName,
      locationTimezone: r.locationTimezone,
    }));
  }

  /** Quien reservó cancela su propio turno. Un turno ajeno responde 404, como si no existiera. */
  async cancelMine(
    user: SessionUser,
    id: string,
    input: CancelBooking,
    now = new Date(),
  ): Promise<Booking> {
    const row = await this.db.query.bookings.findFirst({
      where: and(eq(bookings.id, id), this.ownedBy(user)),
      columns: { businessId: true },
    });
    if (!row) throw new NotFoundException('Turno no encontrado');
    return this.cancel(row.businessId, id, input, now);
  }

  private ownedBy(user: SessionUser) {
    return user.emailVerified
      ? or(eq(bookings.customerUserId, user.id), eq(bookings.customerEmail, user.email))
      : eq(bookings.customerUserId, user.id);
  }

  /**
   * Horarios libres para mover un turno en un día, con cualquier profesional que haga el
   * servicio en la misma sucursal. El horario actual del turno cuenta como libre.
   */
  async rescheduleOptions(
    businessId: string,
    id: string,
    date: string,
    now = new Date(),
  ): Promise<AvailableSlot[]> {
    const current = await this.get(businessId, id);
    this.assertModifiable(current, now);
    const { slots } = await this.availability.find(
      businessId,
      { serviceId: current.serviceId, locationId: current.locationId, from: date, to: date },
      now,
      { ignoreBookingId: id },
    );
    return slots;
  }

  private assertModifiable(booking: Booking, now: Date): void {
    if (booking.status !== 'confirmed') throw new ConflictException(ALREADY_CANCELLED);
    if (new Date(booking.startsAt) <= now) throw new ConflictException(ALREADY_STARTED);
  }
}
