import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Business, CreateBusiness, UpdateBusiness } from '@booklet/shared';
import { eq } from 'drizzle-orm';
import { rethrowUnique } from '../common/db-errors.js';
import { toBusiness } from '../common/mappers.js';
import { DB, type Database } from '../database/database.module.js';
import { businesses } from '../database/schema.js';

@Injectable()
export class BusinessesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: CreateBusiness): Promise<Business> {
    try {
      const [row] = await this.db.insert(businesses).values(input).returning();
      return toBusiness(row!);
    } catch (err) {
      rethrowUnique(err, `Ya existe un negocio con la dirección "${input.slug}"`);
    }
  }

  async getBySlug(slug: string): Promise<Business> {
    const row = await this.db.query.businesses.findFirst({ where: eq(businesses.slug, slug) });
    if (!row) throw new NotFoundException('Negocio no encontrado');
    return toBusiness(row);
  }

  async update(id: string, input: UpdateBusiness): Promise<Business> {
    await this.require(id);
    if (Object.keys(input).length === 0) return this.getById(id);
    const [row] = await this.db
      .update(businesses)
      .set(input)
      .where(eq(businesses.id, id))
      .returning();
    return toBusiness(row!);
  }

  async getById(id: string): Promise<Business> {
    const row = await this.db.query.businesses.findFirst({ where: eq(businesses.id, id) });
    if (!row) throw new NotFoundException('Negocio no encontrado');
    return toBusiness(row);
  }

  /** Verifica que el negocio exista antes de operar sobre algo que le pertenece. */
  async require(id: string): Promise<void> {
    await this.getById(id);
  }
}
