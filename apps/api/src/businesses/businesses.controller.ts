import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  createBusinessSchema,
  slugSchema,
  updateBusinessSchema,
  type Business,
  type CreateBusiness,
  type UpdateBusiness,
} from '@booklet/shared';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { BusinessesService } from './businesses.service.js';

@Controller('businesses')
export class BusinessesController {
  constructor(@Inject(BusinessesService) private readonly businesses: BusinessesService) {}

  @Post()
  create(@Body(new ZodPipe(createBusinessSchema)) body: CreateBusiness): Promise<Business> {
    return this.businesses.create(body);
  }

  /** Búsqueda pública por dirección: `/businesses/by-slug/peluqueria-ana`. */
  @Get('by-slug/:slug')
  getBySlug(@Param('slug', new ZodPipe(slugSchema)) slug: string): Promise<Business> {
    return this.businesses.getBySlug(slug);
  }

  @Get(':businessId')
  get(@Param('businessId', UuidPipe) id: string): Promise<Business> {
    return this.businesses.getById(id);
  }

  @Patch(':businessId')
  update(
    @Param('businessId', UuidPipe) id: string,
    @Body(new ZodPipe(updateBusinessSchema)) body: UpdateBusiness,
  ): Promise<Business> {
    return this.businesses.update(id, body);
  }
}
