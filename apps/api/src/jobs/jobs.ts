import type { MailMessage } from '../mail/mailer.js';

export const QUEUE_NAME = 'jobs';
export const JOB_QUEUE = Symbol('JOB_QUEUE');

/** Trabajos que procesa la cola, con sus datos. */
export interface JobData {
  'mail.send': MailMessage;
  /** Recordatorio de un turno. `startsAt` es el horario al programarlo: si cambió, no se manda. */
  'booking.reminder': { bookingId: string; kind: ReminderKind; startsAt: string };
}

export type ReminderKind = '24h' | '1h';

export type JobName = keyof JobData;
