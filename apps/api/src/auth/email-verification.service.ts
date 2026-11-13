import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { User } from '@booklet/shared';
import { and, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { signToken, verifyToken } from '../common/signed-token.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import { users } from '../database/schema.js';
import { JobsService } from '../jobs/jobs.service.js';
import { renderMail } from '../mail/layout.js';
import { REDIS } from '../redis/redis.module.js';
import { toUser } from './to-user.js';

const PURPOSE = 'verify-email';
const VALID_HOURS = 48;
const RESEND_EVERY_SECONDS = 60;

export const INVALID_LINK = 'El link no es válido o venció. Pedí uno nuevo desde tu cuenta.';

/**
 * Verificación del email de las cuentas con contraseña. El link lleva un token firmado con el
 * id y el email: si la persona cambia de email, los links viejos dejan de servir.
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger('Verificación');

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async send(user: { id: string; email: string; name: string }, now = new Date()): Promise<void> {
    const token = signToken(
      PURPOSE,
      { userId: user.id, email: user.email },
      this.env.APP_SECRET,
      new Date(now.getTime() + VALID_HOURS * 3_600_000),
    );
    const { html, text } = renderMail({
      title: 'Confirmá tu email',
      paragraphs: [
        `Hola, ${user.name}. Tocá el botón para confirmar que este email es tuyo.`,
        'Así podemos mandarte tus turnos y avisos sin que se pierdan.',
      ],
      action: { label: 'Confirmar mi email', url: `${this.env.WEB_URL}/verificar?token=${token}` },
      footnote: `El link vence en ${VALID_HOURS} horas. Si no creaste una cuenta en Booklet, ignorá este mail.`,
    });
    try {
      await this.jobs.sendMail({
        to: user.email,
        subject: 'Confirmá tu email en Booklet',
        html,
        text,
      });
    } catch (err) {
      // La cuenta ya existe: si la cola falla, la persona puede pedir el link de nuevo.
      this.logger.error(`No se pudo encolar la verificación de ${user.email}: ${String(err)}`);
    }
  }

  /** Vuelve a mandar el link, como mucho una vez por minuto. */
  async resend(user: typeof users.$inferSelect): Promise<void> {
    if (user.emailVerified) throw new BadRequestException('Tu email ya está confirmado');
    const key = `rl:verify:${user.id}`;
    const fresh = await this.redis.set(key, '1', 'EX', RESEND_EVERY_SECONDS, 'NX');
    if (fresh === null) {
      throw new HttpException(
        'Ya te mandamos un link hace menos de un minuto. Revisá tu correo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.send(user);
  }

  async verify(token: string, now = new Date()): Promise<User> {
    const data = verifyToken(PURPOSE, token, this.env.APP_SECRET, now);
    if (!data?.userId || !data.email) throw new BadRequestException(INVALID_LINK);
    const [row] = await this.db
      .update(users)
      .set({ emailVerified: true })
      .where(and(eq(users.id, data.userId), eq(users.email, data.email)))
      .returning();
    if (!row) throw new BadRequestException(INVALID_LINK);
    return toUser(row);
  }
}
