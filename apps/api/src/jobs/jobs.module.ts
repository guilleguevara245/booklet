import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ENV, type Env } from '../config/env.js';
import { JobHandlers } from './job-handlers.js';
import { JOB_QUEUE, QUEUE_NAME } from './jobs.js';
import { JobsService } from './jobs.service.js';
import { JobsWorker } from './jobs.worker.js';

@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      inject: [ENV],
      useFactory: (env: Env) =>
        new Queue(QUEUE_NAME, {
          connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
          prefix: env.QUEUE_PREFIX,
          defaultJobOptions: {
            // 5 intentos con espera creciente: 10 s, 20 s, 40 s, 80 s.
            attempts: 5,
            backoff: { type: 'exponential', delay: env.JOB_BACKOFF_MS },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        }),
    },
    JobsService,
    JobsWorker,
    JobHandlers,
  ],
  exports: [JobsService, JobHandlers, JobsWorker],
})
export class JobsModule implements OnApplicationShutdown {
  constructor(@Inject(JOB_QUEUE) private readonly queue: Queue) {}

  async onApplicationShutdown() {
    await this.queue.close();
  }
}
