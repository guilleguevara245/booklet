import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  createServiceSchema,
  updateServiceSchema,
  type CreateService,
  type Service,
  type UpdateService,
} from '@booklet/shared';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ServicesService } from './services.service.js';

@Controller('businesses/:businessId/services')
export class ServicesController {
  constructor(@Inject(ServicesService) private readonly catalog: ServicesService) {}

  @Get()
  list(@Param('businessId', UuidPipe) businessId: string): Promise<Service[]> {
    return this.catalog.list(businessId);
  }

  @Post()
  create(
    @Param('businessId', UuidPipe) businessId: string,
    @Body(new ZodPipe(createServiceSchema)) body: CreateService,
  ): Promise<Service> {
    return this.catalog.create(businessId, body);
  }

  @Patch(':id')
  update(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateServiceSchema)) body: UpdateService,
  ): Promise<Service> {
    return this.catalog.update(businessId, id, body);
  }
}
