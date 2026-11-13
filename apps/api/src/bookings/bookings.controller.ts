import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import {
  cancelBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  rescheduleBookingSchema,
  rescheduleOptionsQuerySchema,
  type AvailableSlot,
  type Booking,
  type CancelBooking,
  type CreateBooking,
  type ListBookingsQuery,
  type MyBooking,
  type RescheduleBooking,
  type RescheduleOptionsQuery,
} from '@booklet/shared';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { BookingsService } from './bookings.service.js';
import { CurrentUser, Public, Roles } from '../auth/request-user.js';
import type { SessionUser } from '../auth/sessions.service.js';

@Controller('businesses/:businessId/bookings')
export class BookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Post()
  @Public()
  create(
    @Param('businessId', UuidPipe) businessId: string,
    @Body(new ZodPipe(createBookingSchema)) body: CreateBooking,
    @CurrentUser() user: SessionUser | undefined,
  ): Promise<Booking> {
    return this.bookings.create(businessId, body, new Date(), user?.id ?? null);
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

  @Get(':id/reschedule-options')
  @Roles('owner', 'staff')
  rescheduleOptions(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
    @Query(new ZodPipe(rescheduleOptionsQuerySchema)) query: RescheduleOptionsQuery,
  ): Promise<AvailableSlot[]> {
    return this.bookings.rescheduleOptions(businessId, id, query.date);
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

/** Turnos de la persona con sesión, en cualquier negocio. */
@Controller('me/bookings')
export class MyBookingsController {
  constructor(@Inject(BookingsService) private readonly bookings: BookingsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser): Promise<MyBooking[]> {
    return this.bookings.listMine(user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodPipe(cancelBookingSchema)) body: CancelBooking,
    @CurrentUser() user: SessionUser,
  ): Promise<Booking> {
    return this.bookings.cancelMine(user, id, body);
  }
}
