import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscordAccountLinkEntity } from '../../infrastructure/database/entities/discord-account-link.entity';
import { DiscordOutboundModule } from '../discord-chat/discord-outbound.module';
import { DiscordAccountLinkService } from './application/services/discord-account-link.service';
import { DiscordGuildMembershipService } from './application/services/discord-guild-membership.service';
import { DiscordPendingJoinService } from './application/services/discord-pending-join.service';
import { WispaceDiscordTokenVerifyService } from './infrastructure/wispace/wispace-discord-token-verify.service';
import { DiscordOauthController } from './presentation/controllers/discord-oauth.controller';
import { DiscordGuildController } from './presentation/controllers/discord-guild.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscordAccountLinkEntity]),
    DiscordOutboundModule,
  ],
  controllers: [DiscordOauthController, DiscordGuildController],
  providers: [
    WispaceDiscordTokenVerifyService,
    DiscordAccountLinkService,
    DiscordGuildMembershipService,
    DiscordPendingJoinService,
  ],
  exports: [DiscordAccountLinkService],
})
export class AccountLinkModule {}
