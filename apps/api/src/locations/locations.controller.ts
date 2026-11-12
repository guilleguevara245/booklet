import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  createLocationSchema,
  updateLocationSchema,
  type CreateLocation,
  type Location,
  type UpdateLocation,
} from '@booklet/shared';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { LocationsService } from './locations.service.js';

@Controller('businesses/:businessId/locations')
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Get()
  list(@Param('businessId', UuidPipe) businessId: string): Promise<Location[]> {
    return this.locations.list(businessId);
  }

  @Post()
  create(
    @Param('businessId', UuidPipe) businessId: string,
    @Body(new ZodPipe(createLocationSchema)) body: CreateLocation,
  ): Promise<Location> {
    return this.locations.create(businessId, body);
  }

  @Patch(':id')
  update(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(updateLocationSchema)) body: UpdateLocation,
  ): Promise<Location> {
    return this.locations.update(businessId, id, body);
  }
}
