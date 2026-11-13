import { Inject, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import {
  SESSION_COOKIE,
  type ClientToServerEvents,
  type JoinResult,
  type ServerToClientEvents,
} from '@booklet/shared';
import { and, eq } from 'drizzle-orm';
import type { Subscription } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import type { SessionUser } from '../auth/sessions.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { ENV, type Env } from '../config/env.js';
import { DB, type Database } from '../database/database.module.js';
import { memberships } from '../database/schema.js';
import { BookingEvents } from './booking-events.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, { user?: SessionUser }>;

export const roomOf = (businessId: string) => `business:${businessId}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Tiempo real del panel. Al conectar se valida la sesión, con las mismas reglas que HTTP:
 * cookie desde un origen permitido, o token en `auth.token` (apps nativas). Después, cada
 * panel se suma a la sala de su negocio y recibe los cambios de turnos.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() private server!: Server<ClientToServerEvents, ServerToClientEvents>;
  private readonly allowedOrigins: Set<string>;
  private subscription?: Subscription;

  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(BookingEvents) private readonly events: BookingEvents,
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
  ) {
    this.allowedOrigins = new Set(env.CORS_ORIGIN.split(',').map((o) => o.trim()));
  }

  onModuleInit() {
    this.subscription = this.events.events$.subscribe(({ type, booking }) => {
      this.server?.to(roomOf(booking.businessId)).emit(type, booking);
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  /** Valida la sesión antes de aceptar la conexión; si falla, el cliente recibe `connect_error`. */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      this.authenticate(socket as AppSocket)
        .then((reason) => next(reason ? new Error(reason) : undefined))
        .catch((err: unknown) => next(err instanceof Error ? err : new Error(String(err))));
    });
  }

  /** Devuelve el motivo del rechazo, o `undefined` si la sesión es válida. */
  private async authenticate(socket: AppSocket): Promise<string | undefined> {
    const { auth, headers } = socket.handshake;
    const bearer = typeof auth?.token === 'string' ? auth.token : undefined;
    const cookie = readCookie(headers.cookie, SESSION_COOKIE);

    // Con cookie, el navegador la manda sola: el origen tiene que ser la web de Booklet.
    if (!bearer && cookie && !this.allowedOrigins.has(headers.origin ?? '')) {
      return 'Origen no permitido';
    }
    const token = bearer ?? cookie;
    const user = token ? await this.sessions.resolve(token) : null;
    if (!user) return 'Iniciá sesión para continuar';
    socket.data.user = user;
    return undefined;
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() businessId: unknown,
  ): Promise<JoinResult> {
    const user = socket.data.user;
    if (!user) return { ok: false, error: 'Iniciá sesión para continuar' };
    if (typeof businessId !== 'string' || !UUID.test(businessId)) {
      return { ok: false, error: 'Negocio inválido' };
    }
    const member = await this.db.query.memberships.findFirst({
      where: and(eq(memberships.businessId, businessId), eq(memberships.userId, user.id)),
      columns: { role: true },
    });
    if (!member) return { ok: false, error: 'No tenés permiso para ver este negocio' };
    await socket.join(roomOf(businessId));
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() socket: AppSocket,
    @MessageBody() businessId: unknown,
  ): Promise<void> {
    if (typeof businessId === 'string') await socket.leave(roomOf(businessId));
  }
}
