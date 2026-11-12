import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Closure, CreateClosure } from '@booklet/shared';
import { and, asc, eq, gt, lt, type SQL } from 'drizzle-orm';
import { BusinessesService } from '../businesses/businesses.service.js';
import { toClosure } from '../common/mappers.js';
import { DB, type Database } from '../database/database.module.js';
import { closures } from '../database/schema.js';
import { LocationsService } from '../locations/locations.service.js';
import { StaffService } from '../staff/staff.service.js';

@Injectable()
export class ClosuresService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BusinessesService) private readonly businesses: BusinessesService,
    @Inject(LocationsService) private readonly locations: LocationsService,
    @Inject(StaffService) private readonly staff: StaffService,
  ) {}

  /** Cierres del negocio; con `from`/`to`, solo los que se superponen con ese rango. */
  async list(businessId: string, range: { from?: string; to?: string } = {}): Promise<Closure[]> {
    await this.businesses.require(businessId);
    const where: SQL[] = [eq(closures.businessId, businessId)];
    if (range.to) where.push(lt(closures.startsAt, new Date(range.to)));
    if (range.from) where.push(gt(closures.endsAt, new Date(range.from)));
    const rows = await this.db.query.closures.findMany({
      where: and(...where),
      orderBy: asc(closures.startsAt),
    });
    return rows.map(toClosure);
  }

  async create(businessId: string, input: CreateClosure): Promise<Closure> {
    await this.businesses.require(businessId);
    if (input.locationId) await this.locations.get(businessId, input.locationId);
    if (input.staffId) await this.staff.get(businessId, input.staffId);
    const [row] = await this.db
      .insert(closures)
      .values({
        businessId,
        locationId: input.locationId ?? null,
        staffId: input.staffId ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        reason: input.reason ?? null,
      })
      .returning();
    return toClosure(row!);
  }

  async remove(businessId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(closures)
      .where(and(eq(closures.id, id), eq(closures.businessId, businessId)))
      .returning({ id: closures.id });
    if (deleted.length === 0) throw new NotFoundException('Cierre no encontrado');
  }
}
