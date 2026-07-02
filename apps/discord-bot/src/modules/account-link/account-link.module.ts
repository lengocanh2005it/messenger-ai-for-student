import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscordAccountLinkEntity } from '../../infrastructure/database/entities/discord-account-link.entity';
import { DiscordOutboundModule } from '../discord-chat/discord-outbound.module';
import { DiscordAccountLinkService } from './application/services/discord-account-link.service';
import { WispaceDiscordTokenVerifyService } from './infrastructure/wispace/wispace-discord-token-verify.service';
import { DiscordOauthController } from './presentation/controllers/discord-oauth.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscordAccountLinkEntity]),
    DiscordOutboundModule,
  ],
  controllers: [DiscordOauthController],
  providers: [WispaceDiscordTokenVerifyService, DiscordAccountLinkService],
  exports: [DiscordAccountLinkService],
})
export class AccountLinkModule {}
