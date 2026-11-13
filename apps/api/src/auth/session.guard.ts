import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE } from '@booklet/shared';
import type { FastifyRequest } from 'fastify';
import { ENV, type Env } from '../config/env.js';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module.js';
import { memberships } from '../database/schema.js';
import { PUBLIC, ROLES, type MemberRole } from './request-user.js';
import { SessionsService } from './sessions.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Lee el token de la cookie de sesión o del encabezado `Authorization: Bearer`. */
function readToken(req: FastifyRequest): FastifyRequest['sessionToken'] {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return { value: auth.slice(7).trim(), source: 'bearer' };
  const cookie = req.cookies?.[SESSION_COOKIE];
  return cookie ? { value: cookie, source: 'cookie' } : undefined;
}

/**
 * Corre antes de cada ruta: identifica a la persona por su sesión y aplica tres reglas.
 *
 * 1. Todo exige sesión (401), salvo lo marcado con `@Public()`.
 * 2. Las rutas con `@Roles(...)` exigen ser miembro del negocio de `:businessId` con alguno
 *    de esos roles (403).
 * 3. Protección CSRF: si la sesión viene en una cookie y el pedido modifica algo, el
 *    encabezado `Origin` tiene que ser uno de los orígenes permitidos. Así otra página no
 *    puede usar la cookie de alguien para actuar en su nombre. Con `Bearer` no hace falta:
 *    el navegador nunca lo agrega solo.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
  ) {
    this.allowedOrigins = new Set(env.CORS_ORIGIN.split(',').map((o) => o.trim()));
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // Los WebSockets validan la sesión al conectar, en el RealtimeGateway.
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const token = readToken(req);
    if (token) {
      const user = await this.sessions.resolve(token.value);
      if (user) {
        req.user = user;
        req.sessionToken = token;
      }
    }

    if (req.sessionToken?.source === 'cookie' && !SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (!origin || !this.allowedOrigins.has(origin)) {
        throw new ForbiddenException('Origen no permitido');
      }
    }

    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    if (!req.user) throw new UnauthorizedException('Iniciá sesión para continuar');

    const roles = this.reflector.getAllAndOverride<MemberRole[] | undefined>(ROLES, targets);
    if (roles) {
      const businessId = (req.params as Record<string, string | undefined>).businessId;
      const role = businessId ? await this.roleIn(businessId, req.user.id) : undefined;
      if (!role || !roles.includes(role)) {
        throw new ForbiddenException('No tenés permiso para hacer esto en este negocio');
      }
    }
    return true;
  }

  private async roleIn(businessId: string, userId: string): Promise<MemberRole | undefined> {
    // Un id mal formado no puede ser miembro; el pipe de la ruta igual responde 400 después.
    if (!/^[0-9a-f-]{36}$/i.test(businessId)) return undefined;
    const row = await this.db.query.memberships.findFirst({
      where: and(eq(memberships.businessId, businessId), eq(memberships.userId, userId)),
      columns: { role: true },
    });
    return row?.role;
  }
}
