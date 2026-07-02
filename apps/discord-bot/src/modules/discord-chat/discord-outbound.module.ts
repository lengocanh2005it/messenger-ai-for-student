import { Module } from '@nestjs/common';
import { DiscordOutboundService } from './application/services/discord-outbound.service';

/**
 * Split out from `DiscordChatModule` so `AccountLinkModule` (OAuth callback,
 * which sends a welcome DM) can depend on `DiscordOutboundService` without a
 * circular import — `DiscordChatModule` also needs `AccountLinkModule` (to
 * resolve `discordUserId -> WISPACE userId` per message).
 */
@Module({
  providers: [DiscordOutboundService],
  exports: [DiscordOutboundService],
})
export class DiscordOutboundModule {}
