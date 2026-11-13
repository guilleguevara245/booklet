import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { ServicesModule } from '../services/services.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { BookingsController, MyBookingsController } from './bookings.controller.js';
import { ManageBookingController } from './manage.controller.js';
import { BookingNotifier } from './booking-notifier.js';
import { BookingViews } from './booking-views.js';
import { BookingsService } from './bookings.service.js';
import { ManageTokens } from './manage-tokens.js';

@Module({
  imports: [AvailabilityModule, LocationsModule, ServicesModule, StaffModule],
  controllers: [BookingsController, MyBookingsController, ManageBookingController],
  providers: [BookingsService, BookingNotifier, ManageTokens, BookingViews],
  exports: [BookingsService],
})
export class BookingsModule {}
