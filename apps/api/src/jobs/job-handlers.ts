import { Injectable } from '@nestjs/common';
import type { JobData, JobName } from './jobs.js';

type Handler<N extends JobName> = (data: JobData[N]) => Promise<void>;

/**
 * Quién procesa cada tipo de trabajo. Cada módulo registra los suyos al arrancar, así la cola
 * no depende de los módulos que la usan.
 */
@Injectable()
export class JobHandlers {
  private readonly handlers = new Map<JobName, Handler<never>>();

  register<N extends JobName>(name: N, handler: Handler<N>): void {
    this.handlers.set(name, handler as Handler<never>);
  }

  get<N extends JobName>(name: N): Handler<N> | undefined {
    return this.handlers.get(name) as Handler<N> | undefined;
  }
}
