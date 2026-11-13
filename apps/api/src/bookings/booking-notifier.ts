import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MyBooking } from '@booklet/shared';
import { DateTime } from 'luxon';
import { ENV, type Env } from '../config/env.js';
import { JobsService } from '../jobs/jobs.service.js';
import { renderMail } from '../mail/layout.js';
import type { MailMessage } from '../mail/mailer.js';

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

/** Mail de confirmación de una reserva. Exportado para probar el contenido. */
export function confirmationMail(b: MyBooking, manageUrl: string): MailMessage {
  const { html, text } = renderMail({
    title: 'Tu turno quedó reservado',
    paragraphs: [`Hola, ${b.customer.name}. Te esperamos en ${b.business.name}.`],
    details: details(b),
    action: { label: 'Ver, cancelar o cambiar el turno', url: manageUrl },
    footnote:
      'Guardá este mail: el botón te deja gestionar el turno sin crear una cuenta. No lo compartas.',
  });
  return { to: b.customer.email, subject: `Turno confirmado en ${b.business.name}`, html, text };
}

/**
 * Avisa por mail los cambios de un turno a quien lo reservó. Los mails salen por la cola: si el
 * servidor de mails falla, se reintentan, y una falla nunca deshace la reserva.
 */
@Injectable()
export class BookingNotifier {
  private readonly logger = new Logger('Avisos');

  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  manageUrl(token: string): string {
    return `${this.env.WEB_URL}/turno/${token}`;
  }

  async created(b: MyBooking, manageToken: string): Promise<void> {
    await this.enqueue(confirmationMail(b, this.manageUrl(manageToken)), `confirm-${b.id}`);
  }

  private async enqueue(message: MailMessage, jobId: string): Promise<void> {
    try {
      await this.jobs.sendMail(message, { jobId });
    } catch (err) {
      // El turno ya quedó guardado: si la cola no responde, se anota y se sigue.
      this.logger.error(
        `No se pudo encolar "${message.subject}" para ${message.to}: ${String(err)}`,
      );
    }
  }
}
