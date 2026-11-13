import { Global, Module } from '@nestjs/common';
import { BookingEvents } from './booking-events.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Global()
@Module({
  providers: [BookingEvents, RealtimeGateway],
  exports: [BookingEvents],
})
export class RealtimeModule {}
