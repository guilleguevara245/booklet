import type { ClientToServerEvents, JoinResult, ServerToClientEvents } from '@booklet/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  client,
  integrationReady,
  signUp,
  startApp,
  uniqueSlug,
  WEB_ORIGIN,
  withSession,
} from './helpers.js';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** La API escuchando en un puerto real: Socket.IO no funciona con `inject`. */
async function listen(app: NestFastifyApplication): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  return app.getUrl();
}

describe.skipIf(!integrationReady)('tiempo real (e2e)', () => {
  let app: NestFastifyApplication;
  let other: NestFastifyApplication;
  let url: string;
  let otherUrl: string;
  let api: ReturnType<typeof client>;
  const sockets: AppSocket[] = [];

  beforeAll(async () => {
    app = await startApp();
    url = await listen(app);
    // Una segunda instancia de la API, para probar el adaptador de Redis.
    other = await startApp();
    otherUrl = await listen(other);
    api = client(app);
  });

  afterEach(() => {
    while (sockets.length) sockets.pop()!.disconnect();
  });

  afterAll(async () => {
    await app?.close();
    await other?.close();
  });

  function connect(base: string, opts: { cookie?: string; origin?: string; token?: string }) {
    const headers: Record<string, string> = {};
    if (opts.cookie) headers.cookie = opts.cookie;
    if (opts.origin) headers.origin = opts.origin;
    const socket: AppSocket = io(base, {
      transports: ['websocket'],
      extraHeaders: headers,
      auth: opts.token ? { token: opts.token } : {},
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  const connected = (socket: AppSocket) =>
    new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });

  const join = (socket: AppSocket, businessId: string) =>
    new Promise<JoinResult>((resolve) => socket.emit('join', businessId, resolve));

  const next = <E extends keyof ServerToClientEvents>(socket: AppSocket, event: E) =>
    new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No llegó ${event}`)), 3000);
      socket.once(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => {
        clearTimeout(timer);
        resolve(payload);
      }) as never);
    });

  /** Negocio abierto el lunes de 9 a 12, con su dueña ya registrada. */
  async function setup() {
    const ownerAccount = await signUp(api, 'Dueña');
    const owner = withSession(api, ownerAccount.as);
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
    const book = (time: string) =>
      api('POST', `${base}/bookings`, {
        serviceId: service.id,
        staffId: ana.id,
        locationId: location.id,
        startsAt: `2030-01-07T${time}:00-03:00`,
        customer: { name: 'Juana', email: 'juana@example.com' },
      });
    return { ownerAccount, owner, business, base, book };
  }

  it('el panel recibe al instante los turnos nuevos, cancelados y reprogramados', async () => {
    const { ownerAccount, owner, business, base, book } = await setup();
    const socket = connect(url, { cookie: ownerAccount.as.cookie, origin: WEB_ORIGIN });
    await connected(socket);
    expect(await join(socket, business.id)).toEqual({ ok: true });

    const created = next(socket, 'booking.created');
    const booking = (await book('09:00')).body;
    expect((await created).id).toBe(booking.id);

    const moved = next(socket, 'booking.rescheduled');
    await owner('POST', `${base}/bookings/${booking.id}/reschedule`, {
      startsAt: '2030-01-07T10:00:00-03:00',
    });
    expect((await moved).startsAt).toBe('2030-01-07T13:00:00.000Z');

    const cancelled = next(socket, 'booking.cancelled');
    await owner('POST', `${base}/bookings/${booking.id}/cancel`);
    expect((await cancelled).status).toBe('cancelled');
  });

  it('no deja escuchar un negocio ajeno', async () => {
    const { business } = await setup();
    const stranger = await signUp(api, 'Extraña');
    const socket = connect(url, { cookie: stranger.as.cookie, origin: WEB_ORIGIN });
    await connected(socket);
    expect(await join(socket, business.id)).toMatchObject({ ok: false });
  });

  it('un panel no recibe avisos de otro negocio', async () => {
    const a = await setup();
    const b = await setup();
    const socket = connect(url, { cookie: a.ownerAccount.as.cookie, origin: WEB_ORIGIN });
    await connected(socket);
    await join(socket, a.business.id);
    let received = false;
    socket.on('booking.created', () => (received = true));
    await b.book('09:00');
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toBe(false);
  });

  it('rechaza la conexión sin sesión', async () => {
    const socket = connect(url, {});
    await expect(connected(socket)).rejects.toThrow('Iniciá sesión para continuar');
  });

  it('rechaza la cookie de sesión desde otro origen', async () => {
    const { ownerAccount } = await setup();
    const socket = connect(url, {
      cookie: ownerAccount.as.cookie,
      origin: 'https://sitio-malicioso.example',
    });
    await expect(connected(socket)).rejects.toThrow('Origen no permitido');
  });

  it('las apps nativas se conectan con el token', async () => {
    const { ownerAccount, business } = await setup();
    const login = await api(
      'POST',
      '/auth/login',
      { email: ownerAccount.email, password: 'contraseña segura' },
      { 'x-booklet-client': 'native' },
    );
    const socket = connect(url, { token: login.body.token });
    await connected(socket);
    expect(await join(socket, business.id)).toEqual({ ok: true });
  });

  it('con dos instancias de la API, el aviso llega a través de Redis', async () => {
    const { ownerAccount, business, book } = await setup();
    // El panel está conectado a la segunda instancia; la reserva entra por la primera.
    const socket = connect(otherUrl, { cookie: ownerAccount.as.cookie, origin: WEB_ORIGIN });
    await connected(socket);
    await join(socket, business.id);
    const created = next(socket, 'booking.created');
    const booking = (await book('11:00')).body;
    expect((await created).id).toBe(booking.id);
  });
});
