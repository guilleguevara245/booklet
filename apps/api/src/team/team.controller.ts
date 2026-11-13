import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import {
  createInvitationSchema,
  type CreatedInvitation,
  type CreateInvitation,
  type Invitation,
  type InvitationPreview,
  type Member,
  type Membership,
} from '@booklet/shared';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../auth/request-user.js';
import type { SessionUser } from '../auth/sessions.service.js';
import { UuidPipe } from '../common/uuid.pipe.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { TeamService } from './team.service.js';

const tokenPipe = new ZodPipe(z.string().regex(/^[\w-]{20,100}$/, 'Token inválido'));

@Controller('businesses/:businessId')
export class TeamController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get('members')
  @Roles('owner', 'staff')
  listMembers(@Param('businessId', UuidPipe) businessId: string): Promise<Member[]> {
    return this.team.listMembers(businessId);
  }

  @Delete('members/:userId')
  @Roles('owner')
  @HttpCode(204)
  removeMember(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('userId', UuidPipe) userId: string,
  ): Promise<void> {
    return this.team.removeMember(businessId, userId);
  }

  @Post('invitations')
  @Roles('owner')
  invite(
    @Param('businessId', UuidPipe) businessId: string,
    @Body(new ZodPipe(createInvitationSchema)) body: CreateInvitation,
    @CurrentUser() user: SessionUser,
  ): Promise<CreatedInvitation> {
    return this.team.invite(businessId, body, user.id);
  }

  @Get('invitations')
  @Roles('owner')
  listInvitations(@Param('businessId', UuidPipe) businessId: string): Promise<Invitation[]> {
    return this.team.listPending(businessId);
  }

  @Delete('invitations/:id')
  @Roles('owner')
  @HttpCode(204)
  revoke(
    @Param('businessId', UuidPipe) businessId: string,
    @Param('id', UuidPipe) id: string,
  ): Promise<void> {
    return this.team.revoke(businessId, id);
  }
}

/** El link que recibe la persona invitada: `/invitations/:token`. */
@Controller('invitations')
export class InvitationLinkController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get(':token')
  @Public()
  preview(@Param('token', tokenPipe) token: string): Promise<InvitationPreview> {
    return this.team.preview(token);
  }

  @Post(':token/accept')
  @HttpCode(200)
  accept(
    @Param('token', tokenPipe) token: string,
    @CurrentUser() user: SessionUser,
  ): Promise<Membership> {
    return this.team.accept(token, user);
  }
}
