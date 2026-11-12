import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateService, Service, UpdateService } from '@booklet/shared';
import { and, asc, eq } from 'drizzle-orm';
import { BusinessesService } from '../businesses/businesses.service.js';
import { toService } from '../common/mappers.js';
import { DB, type Database } from '../database/database.module.js';
import { services } from '../database/schema.js';

@Injectable()
export class ServicesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(BusinessesService) private readonly businesses: BusinessesService,
  ) {}

  async list(businessId: string): Promise<Service[]> {
    await this.businesses.require(businessId);
    const rows = await this.db.query.services.findMany({
      where: eq(services.businessId, businessId),
      orderBy: asc(services.createdAt),
    });
    return rows.map(toService);
  }

  async create(businessId: string, input: CreateService): Promise<Service> {
    await this.businesses.require(businessId);
    const [row] = await this.db
      .insert(services)
      .values({ ...input, businessId })
      .returning();
    return toService(row!);
  }

  async update(businessId: string, id: string, input: UpdateService): Promise<Service> {
    await this.get(businessId, id);
    if (Object.keys(input).length === 0) return this.get(businessId, id);
    const [row] = await this.db
      .update(services)
      .set(input)
      .where(and(eq(services.id, id), eq(services.businessId, businessId)))
      .returning();
    return toService(row!);
  }

  /** Devuelve el servicio solo si pertenece al negocio indicado. */
  async get(businessId: string, id: string): Promise<Service> {
    const row = await this.db.query.services.findFirst({
      where: and(eq(services.id, id), eq(services.businessId, businessId)),
    });
    if (!row) throw new NotFoundException('Servicio no encontrado');
    return toService(row);
  }
}
