import { createHash, createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/**
 * Tokens del link "gestionar mi turno". Se derivan del id del turno con una firma HMAC y la
 * clave APP_SECRET: así el servidor puede volver a armar el link (para un recordatorio, por
 * ejemplo) sin guardarlo. En la base queda solo el hash, para encontrar el turno.
 */
@Injectable()
export class ManageTokens {
  constructor(@Inject(ENV) private readonly env: Env) {}

  forBooking(bookingId: string): string {
    return createHmac('sha256', this.env.APP_SECRET)
      .update(`manage:${bookingId}`)
      .digest('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  url(bookingId: string): string {
    return `${this.env.WEB_URL}/turno/${this.forBooking(bookingId)}`;
  }
}
