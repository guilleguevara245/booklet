import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BookingNotifier, REMINDERS } from '../src/bookings/booking-notifier.js';
import { JOB_QUEUE } from '../src/jobs/jobs.js';
import { JobsWorker } from '../src/jobs/jobs.worker.js';
import {
  client,
  integrationReady,
  mailbox,
  signUp,
  startApp,
  uniqueEmail,
  uniqueSlug,
  waitForMail,
  withSession,
} from './helpers.js';

const START = '2030-01-07T12:00:00.000Z'; // lunes 7, 09:00 en Buenos Aires

describe.skipIf(!integrationReady)('recordatorios y avisos de cambios (e2e)', () => {
  let app: NestFastifyApplication;
  let anon: ReturnType<typeof client>;
  let queue: Queue;

  beforeAll(async () => {
    app = await startApp();
    anon = client(app);
    queue = app.get<Queue>(JOB_QUEUE);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function setup() {
    const owner = withSession(anon, (await signUp(anon, 'Dueña')).as);
    const business = (await owner('POST', '/businesses', { slug: uniqueSlug(), name: 'Estudio' }))
      .body;
    const base = `/businesses/${business.id}`;
    const location = (await owner('POST', `${base}/locations`, { name: 'Centro' })).body;
    const service = (
      await owner('POST', `${base}/services`, { name: 'Clase', durationMinutes: 60 })
    ).body;
    const ana = (await owner('POST', `${base}/staff`, { name: 'Ana', serviceIds: [service.id] }))
      .body;
    await owner('PUT', `${base}/staff/${ana.id}/schedule`, {
      locationId: location.id,
      rules: [{ weekday: 1, start: '09:00', end: '12:00' }],
    });
    const email = uniqueEmail();
    const booking = (
      await anon('POST', `${base}/bookings`, {
        serviceId: service.id,
        staffId: ana.id,
        locationId: location.id,
        startsAt: START,
        customer: { name: 'Juana', email },
      })
    ).body;
    return { owner, base, booking, email };
  }

  /** Cuándo va a correr un recordatorio programado, o `null` si no hay. */
  async function reminderAt(bookingId: string, kind: '24h' | '1h') {
    const job = await queue.getJob(`reminder-${bookingId}-${kind}`);
    return job ? job.timestamp + (job.opts.delay ?? 0) : null;
  }

  it('al reservar programa los recordatorios 24 h y 1 h antes', async () => {
    const { booking } = await setup();
    const start = Date.parse(START);
    expect(await reminderAt(booking.id, '24h')).toBeCloseTo(start - REMINDERS['24h'], -4);
    expect(await reminderAt(booking.id, '1h')).toBeCloseTo(start - REMINDERS['1h'], -4);
  });

  it('al reprogramar mueve los recordatorios y avisa el cambio por mail', async () => {
    const { owner, base, booking, email } = await setup();
    await owner('POST', `${base}/bookings/${booking.id}/reschedule`, {
      startsAt: '2030-01-07T10:00:00-03:00',
    });
    const newStart = Date.parse('2030-01-07T13:00:00Z');
    expect(await reminderAt(booking.id, '1h')).toBeCloseTo(newStart - REMINDERS['1h'], -4);

    const mail = await waitForMail(app, email, (m) => m.subject.startsWith('Cambió tu turno'));
    expect(mail.text).toContain('Cuándo: lunes 7 de enero a las 10:00');
  });

  it('al cancelar saca los recordatorios y avisa con el motivo', async () => {
    const { owner, base, booking, email } = await setup();
    await owner('POST', `${base}/bookings/${booking.id}/cancel`, { reason: 'Se cortó la luz' });
    expect(await reminderAt(booking.id, '24h')).toBeNull();
    expect(await reminderAt(booking.id, '1h')).toBeNull();

    const mail = await waitForMail(app, email, (m) => m.subject.startsWith('Se canceló'));
    expect(mail.text).toContain('Motivo: Se cortó la luz');
  });

  it('cuando llega la hora, manda el recordatorio con el link para gestionar el turno', async () => {
    const { booking, email } = await setup();
    // Se corre el recordatorio ahora, como lo haría la cola al llegar la hora.
    await app.get(JobsWorker).process({
      name: 'booking.reminder',
      data: { bookingId: booking.id, kind: '24h', startsAt: START },
    });
    const mail = await waitForMail(app, email, (m) => m.subject.startsWith('Recordatorio'));
    expect(mail.subject).toBe('Recordatorio: tu turno en Estudio es mañana');
    expect(mail.text).toContain(`/turno/${booking.manageToken}`);
  });

  it('un recordatorio viejo (el turno cambió de horario) no se manda', async () => {
    const { booking, email } = await setup();
    await app.get(BookingNotifier).sendReminder({
      bookingId: booking.id,
      kind: '1h',
      startsAt: '2030-01-07T15:00:00.000Z', // no es el horario actual
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(
      mailbox(app)
        .to(email)
        .filter((m) => m.subject.startsWith('Recordatorio')),
    ).toHaveLength(0);
  });
});
