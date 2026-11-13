import { Inject, Injectable } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import type { MailMessage } from '../mail/mailer.js';
import { JOB_QUEUE, type JobData, type JobName } from './jobs.js';

/**
 * Pone trabajos en la cola de Redis. Los procesa el JobsWorker, en este proceso o en otro:
 * si la API se reinicia en el medio, nada se pierde.
 */
@Injectable()
export class JobsService {
  constructor(@Inject(JOB_QUEUE) private readonly queue: Queue) {}

  async add<N extends JobName>(name: N, data: JobData[N], opts: JobsOptions = {}): Promise<void> {
    await this.queue.add(name, data, opts);
  }

  /** Manda un mail en segundo plano, con reintentos si el servidor de mails falla. */
  sendMail(message: MailMessage, opts: JobsOptions = {}): Promise<void> {
    return this.add('mail.send', message, opts);
  }

  /** Saca un trabajo pendiente (por ejemplo, un recordatorio de un turno cancelado). */
  async remove(jobId: string): Promise<void> {
    await this.queue.remove(jobId);
  }
}
