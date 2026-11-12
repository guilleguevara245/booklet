import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  createClosureSchema,
  listClosuresQuerySchema,
  type Closure,
  type CreateClosure,
} from '@booklet/shared';
import type { z } from 'zod';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { ClosuresService } from './closures.service.js';

@Controller('businesses/:businessId/closures')
export class ClosuresController {
  constructor(@Inject(ClosuresService) private readonly closures: ClosuresService) {}

  @Get()
  list(
    @Param('businessId', UuidPipe) businessId: string,
    @Query(new ZodPipe(listClosuresQuerySchema)) query: z.infer<typeof listClosuresQuerySchema>,
  ): Promise<Closure[]> {
    return this.closures.list(businessId, query);
  }

  @Post()
  create(
    @Param('businessId', UuidPipe) businessId: string,
    @Body(new ZodPipe(createClosureSchema)) body: CreateClosure,
  ): Promise<Closure> {
    return this.closures.create(businessId, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
  ): Promise<void> {
    return this.closures.remove(businessId, id);
  }
}
