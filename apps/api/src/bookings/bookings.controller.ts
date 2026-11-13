import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import {
  createBookingSchema,
  listBookingsQuerySchema,
  type Booking,
  type CreateBooking,
  type ListBookingsQuery,
} from '@booklet/shared';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { BookingsService } from './bookings.service.js';

@Controller('businesses/:businessId/bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Post()
  create(
    @Param('businessId', UuidPipe) businessId: string,
    @Body(new ZodPipe(createBookingSchema)) body: CreateBooking,
  ): Promise<Booking> {
    return this.bookings.create(businessId, body);
  }

  @Get()
  list(
    @Param('businessId', UuidPipe) businessId: string,
    @Query(new ZodPipe(listBookingsQuerySchema)) query: ListBookingsQuery,
  ): Promise<Booking[]> {
    return this.bookings.list(businessId, query);
  }

  @Get(':id')
  get(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
  ): Promise<Booking> {
    return this.bookings.get(businessId, id);
  }
}
