import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { GoogleLogin, Login, Register, User } from '@booklet/shared';
import { eq } from 'drizzle-orm';
import { rethrowUnique } from '../common/db-errors.js';
import { DB, type Database } from '../database/database.module.js';
import { sessions, users } from '../database/schema.js';
import { GOOGLE_VERIFIER, type GoogleIdentity, type GoogleVerifier } from './google-verifier.js';
import { dummyHash, hashPassword, verifyPassword } from './password.js';
import { LoginRateLimiter } from './rate-limit.service.js';
import { SessionsService } from './sessions.service.js';

export const BAD_CREDENTIALS = 'Email o contraseña incorrectos.';
export const EMAIL_TAKEN = 'Ya hay una cuenta con ese email.';
export const GOOGLE_INVALID = 'No pudimos verificar tu cuenta de Google.';

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
    @Inject(GOOGLE_VERIFIER) private readonly google: GoogleVerifier | null,
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

  /**
   * Inicia sesión con Google. Si la cuenta de Google ya está vinculada, entra. Si no, busca
   * una cuenta con el mismo email y la vincula (Google ya verificó que el email es suyo), o
   * crea una nueva. Solo se aceptan emails verificados por Google.
   */
  async loginWithGoogle(
    input: GoogleLogin,
    client: ClientInfo,
  ): Promise<{ user: User; token: string }> {
    if (!this.google)
      throw new ServiceUnavailableException('El inicio con Google no está configurado');
    let identity: GoogleIdentity;
    try {
      identity = await this.google.verify(input.idToken);
    } catch {
      throw new UnauthorizedException(GOOGLE_INVALID);
    }
    if (!identity.emailVerified) throw new UnauthorizedException(GOOGLE_INVALID);

    const row = await this.db.transaction(async (tx) => {
      const linked = await tx.query.users.findFirst({ where: eq(users.googleSub, identity.sub) });
      if (linked) return linked;
      const byEmail = await tx.query.users.findFirst({ where: eq(users.email, identity.email) });
      if (byEmail) {
        // Si nadie había verificado ese email, la cuenta pudo haberla creado otra persona
        // para quedarse con el acceso cuando llegue el dueño real. Se borra la contraseña y
        // se cierran sus sesiones: desde ahora entra solo quien demostró ser dueño del email.
        const untrusted = !byEmail.emailVerified;
        if (untrusted) await tx.delete(sessions).where(eq(sessions.userId, byEmail.id));
        const [updated] = await tx
          .update(users)
          .set({
            googleSub: identity.sub,
            emailVerified: true,
            ...(untrusted ? { passwordHash: null } : {}),
          })
          .where(eq(users.id, byEmail.id))
          .returning();
        return updated!;
      }
      const [created] = await tx
        .insert(users)
        .values({
          email: identity.email,
          name: identity.name,
          googleSub: identity.sub,
          emailVerified: true,
        })
        .returning();
      return created!;
    });
    const token = await this.sessions.create(row.id, client.userAgent);
    return { user: toUser(row), token };
  }
}
