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
import { REQUIRE_USER } from './request-user.js';
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
 * Corre antes de cada ruta: identifica a la persona por su sesión y aplica dos reglas.
 *
 * 1. Las rutas marcadas con `@RequireUser()` responden 401 sin sesión.
 * 2. Protección CSRF: si la sesión viene en una cookie y el pedido modifica algo, el
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
    @Inject(ENV) env: Env,
  ) {
    this.allowedOrigins = new Set(env.CORS_ORIGIN.split(',').map((o) => o.trim()));
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
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

    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_USER, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && !req.user) throw new UnauthorizedException('Iniciá sesión para continuar');
    return true;
  }
}
