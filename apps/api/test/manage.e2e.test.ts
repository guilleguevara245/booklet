import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  client,
  integrationReady,
  signUp,
  startApp,
  uniqueEmail,
  uniqueSlug,
  waitForMail,
  withSession,
} from './helpers.js';

describe.skipIf(!integrationReady)(
  'confirmación por mail y link para gestionar el turno (e2e)',
  () => {
    let app: NestFastifyApplication;
    let anon: ReturnType<typeof client>;

    beforeAll(async () => {
      app = await startApp();
      anon = client(app);
    });

    afterAll(async () => {
      await app?.close();
    });

    /** Negocio abierto el lunes de 9 a 12, y una reserva hecha sin cuenta. */
    async function setup() {
      const owner = withSession(anon, (await signUp(anon, 'Dueña')).as);
      const business = (
        await owner('POST', '/businesses', { slug: uniqueSlug(), name: 'Barbería <Sur>' })
      ).body;
      const base = `/businesses/${business.id}`;
      const location = (
        await owner('POST', `${base}/locations`, { name: 'Boedo', address: 'Av. Boedo 900' })
      ).body;
      const service = (
        await owner('POST', `${base}/services`, { name: 'Corte', durationMinutes: 30 })
      ).body;
      const leo = (await owner('POST', `${base}/staff`, { name: 'Leo', serviceIds: [service.id] }))
        .body;
      await owner('PUT', `${base}/staff/${leo.id}/schedule`, {
        locationId: location.id,
        rules: [{ weekday: 1, start: '09:00', end: '12:00' }],
      });
      const email = uniqueEmail();
      const res = await anon('POST', `${base}/bookings`, {
        serviceId: service.id,
        staffId: leo.id,
        locationId: location.id,
        startsAt: '2030-01-07T09:00:00-03:00',
        customer: { name: 'Juana', email },
      });
      return { owner, base, booking: res.body, email };
    }

    it('al reservar manda la confirmación con el link para gestionar el turno', async () => {
      const { booking, email } = await setup();
      expect(booking.manageToken).toMatch(/^[\w-]{32}$/);

      const mail = await waitForMail(app, email);
      expect(mail.subject).toBe('Turno confirmado en Barbería <Sur>');
      expect(mail.text).toContain('Cuándo: lunes 7 de enero a las 09:00');
      expect(mail.text).toContain('Dónde: Boedo, Av. Boedo 900');
      expect(mail.text).toContain(`http://localhost:5173/turno/${booking.manageToken}`);
      // El nombre del negocio viene de afuera: en el HTML va escapado.
      expect(mail.html).toContain('Barbería &lt;Sur&gt;');
    });

    it('con el link se ve el turno sin iniciar sesión', async () => {
      const { booking } = await setup();
      const res = await anon('GET', `/manage/${booking.manageToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: booking.id,
        serviceName: 'Corte',
        staffName: 'Leo',
        locationTimezone: 'America/Argentina/Buenos_Aires',
      });
    });

    it('con el link se reprograma y se cancela', async () => {
      const { booking } = await setup();
      const token = booking.manageToken;
      const options = (await anon('GET', `/manage/${token}/options?date=2030-01-07`)).body;
      expect(options.map((o: { start: string }) => o.start)).toContain('2030-01-07T13:00:00.000Z');

      const moved = await anon('POST', `/manage/${token}/reschedule`, {
        startsAt: '2030-01-07T10:00:00-03:00',
      });
      expect(moved.status).toBe(200);
      expect(moved.body.startsAt).toBe('2030-01-07T13:00:00.000Z');

      const cancelled = await anon('POST', `/manage/${token}/cancel`, { reason: 'Viajo' });
      expect(cancelled.body).toMatchObject({ status: 'cancelled', cancelReason: 'Viajo' });
    });

    it('un link inventado responde 404', async () => {
      expect((await anon('GET', '/manage/esteTokenNoExisteParaNingunTurno')).status).toBe(404);
      expect((await anon('GET', '/manage/corto')).status).toBe(400);
    });

    it('en la base no queda el token, solo su hash', async () => {
      const { booking, owner, base } = await setup();
      const fromPanel = await owner('GET', `${base}/bookings/${booking.id}`);
      expect(JSON.stringify(fromPanel.body)).not.toContain(booking.manageToken);
    });
  },
);
