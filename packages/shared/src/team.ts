import { z } from 'zod';
import type { MemberRole } from './auth.js';

// Equipo de un negocio: miembros e invitaciones.

export const memberRoleSchema = z.enum(['owner', 'staff']);

export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Email inválido' }).max(200)),
  role: memberRoleSchema.default('staff'),
  /** Profesional al que queda vinculada la cuenta cuando acepte. */
  staffId: z.uuid().nullish(),
});
export type CreateInvitation = z.infer<typeof createInvitationSchema>;

export interface Invitation {
  id: string;
  businessId: string;
  email: string;
  role: MemberRole;
  staffId: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

/** Al crearla, la única vez que se ve el token. Desde la fase 6 viaja por mail. */
export interface CreatedInvitation {
  invitation: Invitation;
  token: string;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

/** Lo que ve quien abre el link de invitación, antes de aceptar. */
export interface InvitationPreview {
  businessName: string;
  businessSlug: string;
  email: string;
  role: MemberRole;
  status: InvitationStatus;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
}
