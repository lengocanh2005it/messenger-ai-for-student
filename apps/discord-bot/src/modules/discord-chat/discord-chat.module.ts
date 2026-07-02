import { Module } from '@nestjs/common';
import { ChatMeteringModule } from '../chat-metering/chat-metering.module';
import { AccountLinkModule } from '../account-link/account-link.module';
import { WispaceModule } from '../wispace/wispace.module';
import { DiscordAgentService } from './application/agent/discord-agent.service';
import { DiscordAgentToolsService } from './application/agent/discord-agent-tools.service';
import { DiscordChatHistoryService } from './application/services/discord-chat-history.service';
import { DiscordRescheduleConfirmationService } from './application/services/discord-reschedule-confirmation.service';
import { DiscordOutboundModule } from './discord-outbound.module';
import { DiscordChatGateway } from './presentation/gateways/discord-chat.gateway';

@Module({
  imports: [
    ChatMeteringModule,
    DiscordOutboundModule,
    AccountLinkModule,
    WispaceModule,
  ],
  providers: [
    DiscordChatGateway,
    DiscordAgentService,
    DiscordAgentToolsService,
    DiscordChatHistoryService,
    DiscordRescheduleConfirmationService,
  ],
})
export class DiscordChatModule {}
