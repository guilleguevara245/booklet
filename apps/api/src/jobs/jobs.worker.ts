import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { ENV, type Env } from '../config/env.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { QUEUE_NAME, type JobData, type JobName } from './jobs.js';

/** Procesa los trabajos de la cola. Con WORKER_ENABLED=false, este proceso solo los encola. */
@Injectable()
export class JobsWorker implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('Jobs');
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  onModuleInit() {
    if (!this.env.WORKER_ENABLED) return;
    this.worker = new Worker(
      QUEUE_NAME,
      (job) => this.process(job as Job<never, unknown, JobName>),
      {
        connection: { url: this.env.REDIS_URL, maxRetriesPerRequest: null },
        prefix: this.env.QUEUE_PREFIX,
        concurrency: 5,
      },
    );
    this.worker.on('failed', (job, err) => {
      const left = job ? (job.opts.attempts ?? 1) - job.attemptsMade : 0;
      this.logger.warn(
        `Falló ${job?.name} (${job?.id}): ${err.message}. Reintentos que quedan: ${left}`,
      );
    });
  }

  async onApplicationShutdown() {
    await this.worker?.close();
  }

  private async process<N extends JobName>(job: Job<JobData[N], unknown, N>): Promise<void> {
    switch (job.name) {
      case 'mail.send':
        await this.mailer.send(job.data as JobData['mail.send']);
        return;
      default:
        throw new Error(`Trabajo desconocido: ${job.name as string}`);
    }
  }
}
