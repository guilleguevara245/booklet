import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ENV, type Env } from '../config/env.js';
import { GOOGLE_VERIFIER, JoseGoogleVerifier } from './google-verifier.js';
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
    {
      provide: GOOGLE_VERIFIER,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.GOOGLE_CLIENT_ID ? new JoseGoogleVerifier(env.GOOGLE_CLIENT_ID) : null,
    },
  ],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}
