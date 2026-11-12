import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateLocation, Location, UpdateLocation } from '@booklet/shared';
import { and, asc, eq } from 'drizzle-orm';
import { BusinessesService } from '../businesses/businesses.service.js';
import { toLocation } from '../common/mappers.js';
import { DB, type Database } from '../database/database.module.js';
import { locations } from '../database/schema.js';

@Injectable()
export class LocationsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BusinessesService) private readonly businesses: BusinessesService,
  ) {}

  async list(businessId: string): Promise<Location[]> {
    await this.businesses.require(businessId);
    const rows = await this.db.query.locations.findMany({
      where: eq(locations.businessId, businessId),
      orderBy: asc(locations.createdAt),
    });
    return rows.map(toLocation);
  }

  async create(businessId: string, input: CreateLocation): Promise<Location> {
    await this.businesses.require(businessId);
    const [row] = await this.db
      .insert(locations)
      .values({ ...input, address: input.address ?? null, businessId })
      .returning();
    return toLocation(row!);
  }

  async update(businessId: string, id: string, input: UpdateLocation): Promise<Location> {
    await this.get(businessId, id);
    if (Object.keys(input).length === 0) return this.get(businessId, id);
    const [row] = await this.db
      .update(locations)
      .set(input)
      .where(and(eq(locations.id, id), eq(locations.businessId, businessId)))
      .returning();
    return toLocation(row!);
  }

  /** Devuelve la sucursal solo si pertenece al negocio indicado. */
  async get(businessId: string, id: string): Promise<Location> {
    const row = await this.db.query.locations.findFirst({
      where: and(eq(locations.id, id), eq(locations.businessId, businessId)),
    });
    if (!row) throw new NotFoundException('Sucursal no encontrada');
    return toLocation(row);
  }
}
