import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import type { HealthResponse } from '@booklet/shared';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  /** 200 si todo responde; 503 con el mismo detalle si alguna dependencia está caída. */
  @Get()
  async get(): Promise<HealthResponse> {
    const result = await this.health.check();
    if (result.status !== 'ok') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
