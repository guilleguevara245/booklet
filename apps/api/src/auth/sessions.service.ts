import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { sessions, users } from '../database/schema.js';

export const SESSION_DAYS = 30;
const DAY = 86_400_000;
const TOUCH_EVERY_MS = 60 * 60_000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type SessionUser = typeof users.$inferSelect;

@Injectable()
export class SessionsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Crea una sesión y devuelve el token. En la base queda solo su hash. */
  async create(userId: string, userAgent?: string, now = new Date()): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(sessions).values({
      userId,
      tokenHash: hashToken(token),
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY),
    });
    return token;
  }

  /** Devuelve la persona de una sesión vigente, o `null` si el token no sirve. */
  async resolve(token: string, now = new Date()): Promise<SessionUser | null> {
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
      .limit(1);
    if (!row) return null;
    // Registrar el último uso como mucho una vez por hora, para no escribir en cada pedido.
    if (now.getTime() - row.session.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
      await this.db
        .update(sessions)
        .set({ lastUsedAt: now })
        .where(eq(sessions.id, row.session.id));
    }
    return row.user;
  }

  async revoke(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
}
