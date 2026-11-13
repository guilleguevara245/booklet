import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  cancelBookingSchema,
  rescheduleBookingSchema,
  rescheduleOptionsQuerySchema,
  type AvailableSlot,
  type CancelBooking,
  type MyBooking,
  type RescheduleBooking,
  type RescheduleOptionsQuery,
} from '@booklet/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Public } from '../auth/request-user.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DB, type Database } from '../database/database.module.js';
import { bookings } from '../database/schema.js';
import { BookingsService, hashManageToken } from './bookings.service.js';

const tokenPipe = new ZodPipe(z.string().regex(/^[\w-]{20,64}$/, 'Link inválido'));

/**
 * El link "gestionar mi turno" de los mails: `/manage/:token`. El token reemplaza a la
 * sesión, así quien reservó sin cuenta puede ver, cancelar o reprogramar su turno.
 */
@Controller('manage/:token')
@Public()
export class ManageBookingController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(DB) private readonly db: Database,
  ) {}

  @Get()
  async view(@Param('token', tokenPipe) token: string): Promise<MyBooking> {
    return this.bookings.view((await this.find(token)).id);
  }

  @Get('options')
  async options(
    @Param('token', tokenPipe) token: string,
    @Query(new ZodPipe(rescheduleOptionsQuerySchema)) query: RescheduleOptionsQuery,
  ): Promise<AvailableSlot[]> {
    const b = await this.find(token);
    return this.bookings.rescheduleOptions(b.businessId, b.id, query.date);
  }

  @Post('cancel')
  @HttpCode(200)
  async cancel(
    @Param('token', tokenPipe) token: string,
    @Body(new ZodPipe(cancelBookingSchema)) body: CancelBooking,
  ): Promise<MyBooking> {
    const b = await this.find(token);
    await this.bookings.cancel(b.businessId, b.id, body);
    return this.bookings.view(b.id);
  }

  @Post('reschedule')
  @HttpCode(200)
  async reschedule(
    @Param('token', tokenPipe) token: string,
    @Body(new ZodPipe(rescheduleBookingSchema)) body: RescheduleBooking,
  ): Promise<MyBooking> {
    const b = await this.find(token);
    await this.bookings.reschedule(b.businessId, b.id, body);
    return this.bookings.view(b.id);
  }

  private async find(token: string) {
    const row = await this.db.query.bookings.findFirst({
      where: eq(bookings.manageTokenHash, hashManageToken(token)),
      columns: { id: true, businessId: true },
    });
    // Mismo error para un token inventado que para uno viejo: no da pistas.
    if (!row) throw new NotFoundException('No encontramos ese turno. Revisá el link del mail.');
    return row;
  }
}
