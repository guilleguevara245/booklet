import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  availabilityQuerySchema,
  type AvailabilityQuery,
  type AvailabilityResponse,
} from '@booklet/shared';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { AvailabilityService } from './availability.service.js';
import { Public } from '../auth/request-user.js';

@Controller('businesses/:businessId/availability')
export class AvailabilityController {
  constructor(@Inject(AvailabilityService) private readonly availability: AvailabilityService) {}

  /** Turnos libres de un servicio entre dos fechas locales: `?serviceId=…&from=2026-11-16&to=2026-11-22`. */
  @Get()
  @Public()
  find(
    @Param('businessId', UuidPipe) businessId: string,
    @Query(new ZodPipe(availabilityQuerySchema)) query: AvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    return this.availability.find(businessId, query);
  }
}
