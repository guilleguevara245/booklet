import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { ClosuresController } from './closures.controller.js';
import { ClosuresService } from './closures.service.js';

@Module({
  imports: [LocationsModule, StaffModule],
  controllers: [ClosuresController],
  providers: [ClosuresService],
})
export class ClosuresModule {}
