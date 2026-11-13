import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { BusinessesModule } from './businesses/businesses.module.js';
import { ClosuresModule } from './closures/closures.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ServicesModule } from './services/services.module.js';
import { StaffModule } from './staff/staff.module.js';
import { TeamModule } from './team/team.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    RealtimeModule,
    BusinessesModule,
    LocationsModule,
    ServicesModule,
    StaffModule,
    ClosuresModule,
    AvailabilityModule,
    BookingsModule,
    TeamModule,
  ],
})
export class AppModule {}
