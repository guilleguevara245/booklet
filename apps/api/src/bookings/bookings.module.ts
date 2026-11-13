import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { ServicesModule } from '../services/services.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { BookingsController, MyBookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [AvailabilityModule, LocationsModule, ServicesModule, StaffModule],
  controllers: [BookingsController, MyBookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
