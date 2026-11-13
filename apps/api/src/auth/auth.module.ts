import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginRateLimiter } from './rate-limit.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionsService } from './sessions.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    LoginRateLimiter,
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}
