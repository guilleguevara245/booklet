import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { SessionUser } from './sessions.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Persona con sesión vigente, si la hay. La completa el SessionGuard. */
    user?: SessionUser;
    /** Token de la sesión del pedido y de dónde vino. */
    sessionToken?: { value: string; source: 'cookie' | 'bearer' };
  }
}

export const REQUIRE_USER = 'booklet:requireUser';

/** La ruta necesita una sesión iniciada; si no hay, responde 401. */
export const RequireUser = () => SetMetadata(REQUIRE_USER, true);

/** Inyecta en el handler la persona con sesión. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<FastifyRequest>().user;
});
