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

export type MemberRole = 'owner' | 'staff';

export const PUBLIC = 'booklet:public';
export const ROLES = 'booklet:roles';

/**
 * La ruta se puede usar sin sesión: catálogo, disponibilidad y reservas de la página pública.
 * Todo lo que no lleva `@Public()` exige una sesión iniciada.
 */
export const Public = () => SetMetadata(PUBLIC, true);

/**
 * La ruta exige ser miembro del negocio de `:businessId` con alguno de estos roles.
 * Sin el rol, responde 403.
 */
export const Roles = (...roles: MemberRole[]) => SetMetadata(ROLES, roles);

/** Inyecta en el handler la persona con sesión. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<FastifyRequest>().user;
});
