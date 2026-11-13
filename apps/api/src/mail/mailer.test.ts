import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryMailer, SmtpMailer } from './mailer.js';

describe('SmtpMailer', () => {
  // Un servidor SMTP de verdad, en un puerto libre, que guarda lo que recibe.
  const received: { from: string; to: string[]; raw: string }[] = [];
  let server: SMTPServer;
  let port: number;

  beforeAll(async () => {
    server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, session, done) {
        let raw = '';
        stream.on('data', (chunk: Buffer) => (raw += chunk.toString()));
        stream.on('end', () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
            to: session.envelope.rcptTo.map((r) => r.address),
            raw,
          });
          done();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('manda el mail con remitente, destinatario, asunto y las dos versiones', async () => {
    const mailer = new SmtpMailer(
      `smtp://127.0.0.1:${port}`,
      'Booklet <no-responder@booklet.test>',
    );
    await mailer.send({
      to: 'juana@example.com',
      subject: 'Tu turno quedó reservado',
      html: '<p>Hola</p>',
      text: 'Hola',
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      from: 'no-responder@booklet.test',
      to: ['juana@example.com'],
    });
    expect(received[0]!.raw).toContain('Content-Type: text/html');
    expect(received[0]!.raw).toContain('Content-Type: text/plain');
  });
});

describe('MemoryMailer', () => {
  it('guarda los mails y los filtra por destinatario', async () => {
    const mailer = new MemoryMailer();
    await mailer.send({ to: 'a@example.com', subject: 'Uno', html: '', text: '' });
    await mailer.send({ to: 'b@example.com', subject: 'Dos', html: '', text: '' });
    expect(mailer.to('b@example.com').map((m) => m.subject)).toEqual(['Dos']);
  });
});
