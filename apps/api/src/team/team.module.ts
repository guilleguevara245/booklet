import { Module } from '@nestjs/common';
import { InvitationLinkController, TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({
  controllers: [TeamController, InvitationLinkController],
  providers: [TeamService],
})
export class TeamModule {}
