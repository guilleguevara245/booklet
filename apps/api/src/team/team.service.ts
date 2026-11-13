import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreatedInvitation,
  CreateInvitation,
  Invitation,
  InvitationPreview,
  Member,
  Membership,
} from '@booklet/shared';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import type { SessionUser } from '../auth/sessions.service.js';
import { DB, type Database } from '../database/database.module.js';
import { businesses, invitations, memberships, staff, users } from '../database/schema.js';

export const INVITATION_DAYS = 7;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const toInvitation = (r: typeof invitations.$inferSelect): Invitation => ({
  id: r.id,
  businessId: r.businessId,
  email: r.email,
  role: r.role,
  staffId: r.staffId,
  createdAt: r.createdAt.toISOString(),
  expiresAt: r.expiresAt.toISOString(),
  acceptedAt: r.acceptedAt?.toISOString() ?? null,
});

@Injectable()
export class TeamService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listMembers(businessId: string): Promise<Member[]> {
    return this.db
      .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.businessId, businessId))
      .orderBy(asc(users.name));
  }

  /** Saca a alguien del equipo. No se puede dejar al negocio sin dueños. */
  async removeMember(businessId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const members = await tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.businessId, businessId))
        .for('update');
      const target = members.find((m) => m.userId === userId);
      if (!target) throw new NotFoundException('Esa persona no es parte del equipo');
      const owners = members.filter((m) => m.role === 'owner');
      if (target.role === 'owner' && owners.length === 1) {
        throw new ConflictException('El negocio tiene que tener al menos un dueño');
      }
      await tx
        .delete(memberships)
        .where(and(eq(memberships.businessId, businessId), eq(memberships.userId, userId)));
      await tx
        .update(staff)
        .set({ userId: null })
        .where(and(eq(staff.businessId, businessId), eq(staff.userId, userId)));
    });
  }

  async invite(
    businessId: string,
    input: CreateInvitation,
    invitedBy: string,
    now = new Date(),
  ): Promise<CreatedInvitation> {
    if (input.staffId) {
      const linked = await this.db.query.staff.findFirst({
        where: and(eq(staff.id, input.staffId), eq(staff.businessId, businessId)),
      });
      if (!linked) throw new BadRequestException('Ese profesional no es de este negocio');
    }
    const already = await this.db
      .select({ id: users.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.businessId, businessId), eq(users.email, input.email)))
      .limit(1);
    if (already.length > 0) throw new ConflictException('Esa persona ya es parte del equipo');

    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .insert(invitations)
      .values({
        businessId,
        email: input.email,
        role: input.role,
        staffId: input.staffId ?? null,
        tokenHash: hashToken(token),
        invitedBy,
        expiresAt: new Date(now.getTime() + INVITATION_DAYS * 86_400_000),
      })
      .returning();
    return { invitation: toInvitation(row!), token };
  }

  async listPending(businessId: string, now = new Date()): Promise<Invitation[]> {
    const rows = await this.db.query.invitations.findMany({
      where: and(
        eq(invitations.businessId, businessId),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, now),
      ),
      orderBy: asc(invitations.createdAt),
    });
    return rows.map(toInvitation);
  }

  async revoke(businessId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, id),
          eq(invitations.businessId, businessId),
          isNull(invitations.acceptedAt),
        ),
      )
      .returning({ id: invitations.id });
    if (deleted.length === 0) throw new NotFoundException('Invitación no encontrada');
  }

  /** Lo que muestra el link antes de aceptar: de qué negocio es y para qué email. */
  async preview(token: string, now = new Date()): Promise<InvitationPreview> {
    const row = await this.findByToken(token);
    return {
      businessName: row.businessName,
      businessSlug: row.businessSlug,
      email: row.invitation.email,
      role: row.invitation.role,
      status: row.invitation.acceptedAt
        ? 'accepted'
        : row.invitation.expiresAt <= now
          ? 'expired'
          : 'pending',
    };
  }

  /**
   * Acepta la invitación con la cuenta de la sesión. Tiene que ser la cuenta del email
   * invitado: un link reenviado no le sirve a otra persona. Si ya era dueño, sigue siéndolo.
   */
  async accept(token: string, user: SessionUser, now = new Date()): Promise<Membership> {
    const { invitation, businessName, businessSlug } = await this.findByToken(token);
    if (invitation.acceptedAt) throw new GoneException('Esta invitación ya se usó');
    if (invitation.expiresAt <= now) throw new GoneException('Esta invitación venció');
    if (invitation.email !== user.email) {
      throw new ForbiddenException(
        `Esta invitación es para ${invitation.email}. Entrá con esa cuenta para aceptarla.`,
      );
    }

    const role = await this.db.transaction(async (tx) => {
      // Marcarla como usada primero: si dos pedidos llegan a la vez, solo uno la toma.
      const claimed = await tx
        .update(invitations)
        .set({ acceptedAt: now, acceptedBy: user.id })
        .where(and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)))
        .returning({ id: invitations.id });
      if (claimed.length === 0) throw new GoneException('Esta invitación ya se usó');

      const [membership] = await tx
        .insert(memberships)
        .values({ businessId: invitation.businessId, userId: user.id, role: invitation.role })
        .onConflictDoNothing()
        .returning({ role: memberships.role });
      if (invitation.staffId) {
        await tx
          .update(staff)
          .set({ userId: user.id })
          .where(
            and(eq(staff.id, invitation.staffId), eq(staff.businessId, invitation.businessId)),
          );
      }
      if (membership) return membership.role;
      const existing = await tx.query.memberships.findFirst({
        where: and(
          eq(memberships.businessId, invitation.businessId),
          eq(memberships.userId, user.id),
        ),
      });
      return existing!.role;
    });

    return { businessId: invitation.businessId, slug: businessSlug, name: businessName, role };
  }

  private async findByToken(token: string) {
    const [row] = await this.db
      .select({
        invitation: invitations,
        businessName: businesses.name,
        businessSlug: businesses.slug,
      })
      .from(invitations)
      .innerJoin(businesses, eq(businesses.id, invitations.businessId))
      .where(eq(invitations.tokenHash, hashToken(token)))
      .limit(1);
    if (!row) throw new NotFoundException('Invitación no encontrada');
    return row;
  }
}
