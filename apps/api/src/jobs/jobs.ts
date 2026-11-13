import type { MailMessage } from '../mail/mailer.js';

export const QUEUE_NAME = 'jobs';
export const JOB_QUEUE = Symbol('JOB_QUEUE');

/** Trabajos que procesa la cola, con sus datos. */
export interface JobData {
  'mail.send': MailMessage;
}

export type JobName = keyof JobData;
