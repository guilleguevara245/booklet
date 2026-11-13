import type { User } from '@booklet/shared';
import type { users } from '../database/schema.js';

/** Fila de la base → datos públicos de la cuenta (nunca el hash de la contraseña). */
export const toUser = (r: typeof users.$inferSelect): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  emailVerified: r.emailVerified,
  hasPassword: r.passwordHash !== null,
  hasGoogle: r.googleSub !== null,
});
