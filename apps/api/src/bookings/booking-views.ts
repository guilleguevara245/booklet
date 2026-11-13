import { Inject, Injectable } from '@nestjs/common';
import type { MyBooking } from '@booklet/shared';
import { desc, eq, type SQL } from 'drizzle-orm';
import { toBooking } from '../common/mappers.js';
import { DB, type Database } from '../database/database.module.js';
import { bookings, businesses, locations, services, staff } from '../database/schema.js';

/** Turnos con los nombres del negocio, servicio, profesional y sucursal, listos para mostrar. */
@Injectable()
export class BookingViews {
  constructor(@Inject(DB) private readonly db: Database) {}

  async find(id: string): Promise<MyBooking | null> {
    const [found] = await this.list(eq(bookings.id, id), 1);
    return found ?? null;
  }

  async list(where: SQL | undefined, limit: number): Promise<MyBooking[]> {
    const rows = await this.db
      .select({
        booking: bookings,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        serviceName: services.name,
        staffName: staff.name,
        locationName: locations.name,
        locationAddress: locations.address,
        locationTimezone: locations.timezone,
      })
      .from(bookings)
      .innerJoin(businesses, eq(businesses.id, bookings.businessId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(staff, eq(staff.id, bookings.staffId))
      .innerJoin(locations, eq(locations.id, bookings.locationId))
      .where(where)
      .orderBy(desc(bookings.startsAt))
      .limit(limit);
    return rows.map((r) => ({
      ...toBooking(r.booking),
      business: { name: r.businessName, slug: r.businessSlug },
      serviceName: r.serviceName,
      staffName: r.staffName,
      locationName: r.locationName,
      locationAddress: r.locationAddress,
      locationTimezone: r.locationTimezone,
    }));
  }
}
