import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { MAILER, MemoryMailer, type MailMessage } from '../src/mail/mailer.js';
import { integrationReady, startApp, startAppWith, uniqueEmail, waitForMail } from './helpers.js';

const message = (to: string): MailMessage => ({
  to,
  subject: 'Hola',
  html: '<p>Hola</p>',
  text: 'Hola',
});

describe.skipIf(!integrationReady)('cola de trabajos (e2e)', () => {
  const apps: NestFastifyApplication[] = [];
  afterAll(async () => {
    for (const app of apps) await app.close();
  });

  it('manda un mail en segundo plano', async () => {
    const app = await startApp();
    apps.push(app);
    const to = uniqueEmail();
    await app.get(JobsService).sendMail(message(to));
    expect((await waitForMail(app, to)).subject).toBe('Hola');
  });

  it('si el servidor de mails falla, reintenta hasta que sale', async () => {
    // Un servidor de mails que falla las dos primeras veces.
    const inbox = new MemoryMailer();
    let calls = 0;
    const flaky = {
      outbox: inbox.outbox,
      to: inbox.to.bind(inbox),
      async send(m: MailMessage) {
        calls++;
        if (calls <= 2) throw new Error('SMTP caído');
        await inbox.send(m);
      },
    };
    const app = await startAppWith([{ provide: MAILER, useValue: flaky }]);
    apps.push(app);
    const to = uniqueEmail();
    await app.get(JobsService).sendMail(message(to));
    await waitForMail(app, to);
    expect(calls).toBe(3);
  });

  it('un trabajo programado para más tarde se puede sacar antes de que corra', async () => {
    const app = await startApp();
    apps.push(app);
    const to = uniqueEmail();
    const jobs = app.get(JobsService);
    await jobs.sendMail(message(to), { jobId: `prueba-${to}`, delay: 300 });
    await jobs.remove(`prueba-${to}`);
    await new Promise((r) => setTimeout(r, 600));
    expect((app.get(MAILER) as MemoryMailer).to(to)).toHaveLength(0);
  });
});
