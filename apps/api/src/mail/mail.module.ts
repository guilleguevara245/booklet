import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { LogMailer, MAILER, MemoryMailer, SmtpMailer } from './mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ENV],
      useFactory: (env: Env) => {
        switch (env.MAIL_TRANSPORT) {
          case 'memory':
            return new MemoryMailer();
          case 'log':
            return new LogMailer();
          default:
            return new SmtpMailer(env.SMTP_URL, env.MAIL_FROM);
        }
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
