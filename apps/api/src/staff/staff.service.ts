import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateStaff, ScheduleRule, SetSchedule, Staff, UpdateStaff } from '@booklet/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { BusinessesService } from '../businesses/businesses.service.js';
import { hhmm } from '../common/mappers.js';
import { DB, type Database } from '../database/database.module.js';
import { services, staff, staffServices, workingHours } from '../database/schema.js';
import { LocationsService } from '../locations/locations.service.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class StaffService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BusinessesService) private readonly businesses: BusinessesService,
    @Inject(LocationsService) private readonly locations: LocationsService,
  ) {}

  async list(businessId: string): Promise<Staff[]> {
    await this.businesses.require(businessId);
    const rows = await this.db.query.staff.findMany({
      where: eq(staff.businessId, businessId),
      orderBy: asc(staff.createdAt),
      with: { services: { columns: { serviceId: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      name: r.name,
      active: r.active,
      serviceIds: r.services.map((s) => s.serviceId).sort(),
    }));
  }

  async get(businessId: string, id: string): Promise<Staff> {
    const row = await this.db.query.staff.findFirst({
      where: and(eq(staff.id, id), eq(staff.businessId, businessId)),
      with: { services: { columns: { serviceId: true } } },
    });
    if (!row) throw new NotFoundException('Profesional no encontrado');
    return {
      id: row.id,
      businessId: row.businessId,
      name: row.name,
      active: row.active,
      serviceIds: row.services.map((s) => s.serviceId).sort(),
    };
  }

  async create(businessId: string, input: CreateStaff): Promise<Staff> {
    await this.businesses.require(businessId);
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(staff)
        .values({ businessId, name: input.name })
        .returning({ id: staff.id });
      await this.replaceServices(tx, businessId, row!.id, input.serviceIds);
      return row!.id;
    });
    return this.get(businessId, id);
  }

  async update(businessId: string, id: string, input: UpdateStaff): Promise<Staff> {
    await this.get(businessId, id);
    if (Object.keys(input).length > 0) {
      await this.db
        .update(staff)
        .set(input)
        .where(and(eq(staff.id, id), eq(staff.businessId, businessId)));
    }
    return this.get(businessId, id);
  }

  async setServices(businessId: string, id: string, serviceIds: string[]): Promise<Staff> {
    await this.get(businessId, id);
    await this.db.transaction((tx) => this.replaceServices(tx, businessId, id, serviceIds));
    return this.get(businessId, id);
  }

  async getSchedule(businessId: string, id: string): Promise<ScheduleRule[]> {
    await this.get(businessId, id);
    const rows = await this.db.query.workingHours.findMany({
      where: eq(workingHours.staffId, id),
      orderBy: [
        asc(workingHours.locationId),
        asc(workingHours.weekday),
        asc(workingHours.startTime),
      ],
    });
    return rows.map((r) => ({
      locationId: r.locationId,
      weekday: r.weekday,
      start: hhmm(r.startTime),
      end: hhmm(r.endTime),
    }));
  }

  /** Reemplaza el horario semanal del profesional en una sucursal (las demás no cambian). */
  async setSchedule(businessId: string, id: string, input: SetSchedule): Promise<ScheduleRule[]> {
    await this.get(businessId, id);
    await this.locations.get(businessId, input.locationId);
    await this.db.transaction(async (tx) => {
      await tx
        .delete(workingHours)
        .where(and(eq(workingHours.staffId, id), eq(workingHours.locationId, input.locationId)));
      if (input.rules.length > 0) {
        await tx.insert(workingHours).values(
          input.rules.map((r) => ({
            staffId: id,
            locationId: input.locationId,
            weekday: r.weekday,
            startTime: r.start,
            endTime: r.end,
          })),
        );
      }
    });
    return this.getSchedule(businessId, id);
  }

  /** Reemplaza los servicios del profesional; todos tienen que ser del mismo negocio. */
  private async replaceServices(tx: Tx, businessId: string, staffId: string, ids: string[]) {
    if (ids.length > 0) {
      const found = await tx
        .select({ id: services.id })
        .from(services)
        .where(and(eq(services.businessId, businessId), inArray(services.id, ids)));
      if (found.length !== ids.length) {
        throw new BadRequestException('Algún servicio no existe o es de otro negocio');
      }
    }
    await tx.delete(staffServices).where(eq(staffServices.staffId, staffId));
    if (ids.length > 0) {
      await tx.insert(staffServices).values(ids.map((serviceId) => ({ staffId, serviceId })));
    }
  }
}
