import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Algo que manda mails. Se elige con MAIL_TRANSPORT. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** Por SMTP: Mailpit en desarrollo, el proveedor de mails en producción. */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/** Bandeja en memoria para las pruebas. */
export class MemoryMailer implements Mailer {
  readonly outbox: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
  }

  /** Mails mandados a una dirección, del más viejo al más nuevo. */
  to(address: string): MailMessage[] {
    return this.outbox.filter((m) => m.to === address);
  }
}

/** Solo anota en el log: útil para correr la API sin servidor de mails. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mail');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`Para ${message.to}: ${message.subject}`);
  }
}
