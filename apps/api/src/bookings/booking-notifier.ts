import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { MyBooking } from '@booklet/shared';
import { DateTime } from 'luxon';
import { JobHandlers } from '../jobs/job-handlers.js';
import type { ReminderKind } from '../jobs/jobs.js';
import { JobsService } from '../jobs/jobs.service.js';
import { renderMail } from '../mail/layout.js';
import type { MailMessage } from '../mail/mailer.js';
import { BookingViews } from './booking-views.js';
import { ManageTokens } from './manage-tokens.js';

/** Cuánto antes del turno sale cada recordatorio. */
export const REMINDERS: Record<ReminderKind, number> = {
  '24h': 24 * 60 * 60_000,
  '1h': 60 * 60_000,
};

/** "sábado 14 de noviembre a las 15:45", en la zona horaria de la sucursal. */
export function formatWhen(iso: string, timezone: string): string {
  return DateTime.fromISO(iso)
    .setZone(timezone)
    .setLocale('es-AR')
    .toFormat("cccc d 'de' LLLL 'a las' HH:mm");
}

/** Detalle del turno que se repite en todos los mails. */
function details(b: MyBooking): [string, string][] {
  return [
    ['Cuándo', formatWhen(b.startsAt, b.locationTimezone)],
    ['Servicio', b.serviceName],
    ['Con', b.staffName],
    ['Dónde', [b.locationName, b.locationAddress].filter(Boolean).join(', ')],
  ];
}

const manageAction = (url: string) => ({ label: 'Ver, cancelar o cambiar el turno', url });
const keepPrivate =
  'El botón te deja gestionar el turno sin crear una cuenta. No compartas este mail.';

export function confirmationMail(b: MyBooking, manageUrl: string): MailMessage {
  const { html, text } = renderMail({
    title: 'Tu turno quedó reservado',
    paragraphs: [`Hola, ${b.customer.name}. Te esperamos en ${b.business.name}.`],
    details: details(b),
    action: manageAction(manageUrl),
    footnote: keepPrivate,
  });
  return { to: b.customer.email, subject: `Turno confirmado en ${b.business.name}`, html, text };
}

export function reminderMail(b: MyBooking, kind: ReminderKind, manageUrl: string): MailMessage {
  const when = kind === '24h' ? 'mañana' : 'en una hora';
  const { html, text } = renderMail({
    title: `Tu turno es ${when}`,
    paragraphs: [
      `Hola, ${b.customer.name}. Te recordamos tu turno en ${b.business.name}.`,
      'Si no podés ir, avisá cancelándolo: así el horario le sirve a otra persona.',
    ],
    details: details(b),
    action: manageAction(manageUrl),
    footnote: keepPrivate,
  });
  return {
    to: b.customer.email,
    subject: `Recordatorio: tu turno en ${b.business.name} es ${when}`,
    html,
    text,
  };
}

export function rescheduledMail(b: MyBooking, manageUrl: string): MailMessage {
  const { html, text } = renderMail({
    title: 'Tu turno cambió de horario',
    paragraphs: [`Hola, ${b.customer.name}. Estos son los datos nuevos de tu turno.`],
    details: details(b),
    action: manageAction(manageUrl),
    footnote: keepPrivate,
  });
  return { to: b.customer.email, subject: `Cambió tu turno en ${b.business.name}`, html, text };
}

export function cancelledMail(b: MyBooking, bookAgainUrl: string): MailMessage {
  const { html, text } = renderMail({
    title: 'Tu turno fue cancelado',
    paragraphs: [
      `Hola, ${b.customer.name}. Se canceló tu turno en ${b.business.name}.`,
      ...(b.cancelReason ? [`Motivo: ${b.cancelReason}`] : []),
    ],
    details: details(b),
    action: { label: 'Reservar otro turno', url: bookAgainUrl },
  });
  return { to: b.customer.email, subject: `Se canceló tu turno en ${b.business.name}`, html, text };
}

const reminderJobId = (bookingId: string, kind: ReminderKind) => `reminder-${bookingId}-${kind}`;

/**
 * Avisa por mail los cambios de un turno a quien lo reservó y programa los recordatorios.
 * Todo sale por la cola: si el servidor de mails falla, se reintenta, y una falla nunca
 * deshace la reserva.
 */
@Injectable()
export class BookingNotifier implements OnModuleInit {
  private readonly logger = new Logger('Avisos');

  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(JobHandlers) private readonly handlers: JobHandlers,
    @Inject(BookingViews) private readonly views: BookingViews,
    @Inject(ManageTokens) private readonly tokens: ManageTokens,
  ) {}

  onModuleInit() {
    this.handlers.register('booking.reminder', (data) => this.sendReminder(data));
  }

  async created(b: MyBooking, now = new Date()): Promise<void> {
    await this.safely(async () => {
      await this.jobs.sendMail(confirmationMail(b, this.tokens.url(b.id)), {
        jobId: `confirm-${b.id}`,
      });
      await this.scheduleReminders(b, now);
    });
  }

  async rescheduled(b: MyBooking, now = new Date()): Promise<void> {
    await this.safely(async () => {
      await this.jobs.sendMail(rescheduledMail(b, this.tokens.url(b.id)));
      await this.scheduleReminders(b, now);
    });
  }

  async cancelled(b: MyBooking): Promise<void> {
    await this.safely(async () => {
      await this.removeReminders(b.id);
      const url = this.tokens.url(b.id).replace(/\/turno\/.*$/, `/n/${b.business.slug}`);
      await this.jobs.sendMail(cancelledMail(b, url));
    });
  }

  /**
   * Programa los recordatorios de 24 h y 1 h antes. Los que ya quedaron en el pasado (un turno
   * reservado para dentro de 3 horas no lleva el de 24 h) no se programan. Si el turno ya tenía
   * recordatorios, se reemplazan.
   */
  async scheduleReminders(b: MyBooking, now = new Date()): Promise<void> {
    await this.removeReminders(b.id);
    for (const [kind, before] of Object.entries(REMINDERS) as [ReminderKind, number][]) {
      const delay = new Date(b.startsAt).getTime() - before - now.getTime();
      if (delay <= 0) continue;
      await this.jobs.add(
        'booking.reminder',
        { bookingId: b.id, kind, startsAt: b.startsAt },
        { jobId: reminderJobId(b.id, kind), delay },
      );
    }
  }

  private async removeReminders(bookingId: string): Promise<void> {
    for (const kind of Object.keys(REMINDERS) as ReminderKind[]) {
      await this.jobs.remove(reminderJobId(bookingId, kind));
    }
  }

  /** Corre en la cola cuando llega la hora. Si el turno cambió o se canceló, no manda nada. */
  async sendReminder(data: { bookingId: string; kind: ReminderKind; startsAt: string }) {
    const b = await this.views.find(data.bookingId);
    if (!b || b.status !== 'confirmed' || b.startsAt !== data.startsAt) return;
    await this.jobs.sendMail(reminderMail(b, data.kind, this.tokens.url(b.id)), {
      jobId: `sent-${reminderJobId(b.id, data.kind)}`,
    });
  }

  private async safely(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      // El cambio del turno ya quedó guardado: si la cola no responde, se anota y se sigue.
      this.logger.error(`No se pudo encolar un aviso: ${String(err)}`);
    }
  }
}
