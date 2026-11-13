import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import {
  cancelBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  rescheduleBookingSchema,
  type Booking,
  type CancelBooking,
  type CreateBooking,
  type ListBookingsQuery,
  type RescheduleBooking,
} from '@booklet/shared';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { BookingsService } from './bookings.service.js';
import { Public, Roles } from '../auth/request-user.js';

@Controller('businesses/:businessId/bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Post()
  @Public()
  create(
    @Param('businessId', UuidPipe) businessId: string,
    @Body(new ZodPipe(createBookingSchema)) body: CreateBooking,
  ): Promise<Booking> {
    return this.bookings.create(businessId, body);
  }

  @Get()
  @Roles('owner', 'staff')
  list(
    @Param('businessId', UuidPipe) businessId: string,
    @Query(new ZodPipe(listBookingsQuerySchema)) query: ListBookingsQuery,
  ): Promise<Booking[]> {
    return this.bookings.list(businessId, query);
  }

  @Get(':id')
  @Roles('owner', 'staff')
  get(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
  ): Promise<Booking> {
    return this.bookings.get(businessId, id);
  }

  @Post(':id/cancel')
  @Roles('owner', 'staff')
  @HttpCode(200)
  cancel(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(cancelBookingSchema)) body: CancelBooking,
  ): Promise<Booking> {
    return this.bookings.cancel(businessId, id, body);
  }

  @Post(':id/reschedule')
  @Roles('owner', 'staff')
  @HttpCode(200)
  reschedule(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(rescheduleBookingSchema)) body: RescheduleBooking,
  ): Promise<Booking> {
    return this.bookings.reschedule(businessId, id, body);
  }
}
