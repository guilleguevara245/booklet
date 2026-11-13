import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

const WINDOW_SECONDS = 15 * 60;
/** Intentos fallidos permitidos por email y por IP en cada ventana de 15 minutos. */
export const MAX_FAILURES_PER_EMAIL = 5;
export const MAX_FAILURES_PER_IP = 50;

/**
 * Frena la adivinación de contraseñas: cuenta los intentos fallidos en Redis y bloquea
 * por 15 minutos al superar el límite. Un inicio correcto limpia el contador del email.
 */
@Injectable()
export class LoginRateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private keys(email: string, ip: string) {
    return { email: `rl:login:email:${email}`, ip: `rl:login:ip:${ip}` };
  }

  async assertAllowed(email: string, ip: string): Promise<void> {
    const k = this.keys(email, ip);
    const [byEmail, byIp] = await this.redis.mget(k.email, k.ip);
    if (
      Number(byEmail ?? 0) >= MAX_FAILURES_PER_EMAIL ||
      Number(byIp ?? 0) >= MAX_FAILURES_PER_IP
    ) {
      throw new HttpException(
        'Demasiados intentos. Probá de nuevo en 15 minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    const k = this.keys(email, ip);
    await this.redis
      .multi()
      .incr(k.email)
      .expire(k.email, WINDOW_SECONDS, 'NX')
      .incr(k.ip)
      .expire(k.ip, WINDOW_SECONDS, 'NX')
      .exec();
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(this.keys(email, '').email);
  }
}
