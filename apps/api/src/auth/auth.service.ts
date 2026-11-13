import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Login, Register, User } from '@booklet/shared';
import { eq } from 'drizzle-orm';
import { rethrowUnique } from '../common/db-errors.js';
import { DB, type Database } from '../database/database.module.js';
import { users } from '../database/schema.js';
import { dummyHash, hashPassword, verifyPassword } from './password.js';
import { LoginRateLimiter } from './rate-limit.service.js';
import { SessionsService } from './sessions.service.js';

export const BAD_CREDENTIALS = 'Email o contraseña incorrectos.';
export const EMAIL_TAKEN = 'Ya hay una cuenta con ese email.';

export const toUser = (r: typeof users.$inferSelect): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  emailVerified: r.emailVerified,
  hasPassword: r.passwordHash !== null,
  hasGoogle: r.googleSub !== null,
});

export interface ClientInfo {
  ip: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(LoginRateLimiter) private readonly limiter: LoginRateLimiter,
  ) {}

  async register(input: Register, client: ClientInfo): Promise<{ user: User; token: string }> {
    const passwordHash = await hashPassword(input.password);
    let row: typeof users.$inferSelect;
    try {
      [row] = (await this.db
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash })
        .returning()) as [typeof users.$inferSelect];
    } catch (err) {
      rethrowUnique(err, EMAIL_TAKEN);
    }
    const token = await this.sessions.create(row.id, client.userAgent);
    return { user: toUser(row), token };
  }

  /**
   * Inicia sesión. El mensaje de error es el mismo si el email no existe o si la contraseña
   * está mal, y el tiempo de respuesta también: no se puede averiguar quién tiene cuenta.
   */
  async login(input: Login, client: ClientInfo): Promise<{ user: User; token: string }> {
    await this.limiter.assertAllowed(input.email, client.ip);
    const row = await this.db.query.users.findFirst({ where: eq(users.email, input.email) });
    const ok = await verifyPassword(input.password, row?.passwordHash ?? (await dummyHash()));
    if (!row || !row.passwordHash || !ok) {
      await this.limiter.recordFailure(input.email, client.ip);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    await this.limiter.reset(input.email);
    const token = await this.sessions.create(row.id, client.userAgent);
    return { user: toUser(row), token };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.revoke(token);
  }
}
