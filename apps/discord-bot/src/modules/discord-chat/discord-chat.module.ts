import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAiAdapter, type LlmProviderAdapter } from '@wispace/llm-agent';
import { ChatMeteringModule } from '../chat-metering/chat-metering.module';
import { AccountLinkModule } from '../account-link/account-link.module';
import { WispaceModule } from '../wispace/wispace.module';
import { DiscordAgentService } from './application/agent/discord-agent.service';
import { DiscordAgentToolsService } from './application/agent/discord-agent-tools.service';
import { DiscordChatHistoryService } from './application/services/discord-chat-history.service';
import { DiscordRescheduleConfirmationService } from './application/services/discord-reschedule-confirmation.service';
import { DiscordMenuService } from './application/services/discord-menu.service';
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
    {
      provide: 'LLM_PROVIDER_ADAPTER',
      useFactory: (configService: ConfigService): LlmProviderAdapter => {
        return new OpenAiAdapter(
          () =>
            configService.get<string>('OPENAI_API_KEY')?.trim() || undefined,
          () => configService.get<string>('OPENAI_MODEL')?.trim() || 'gpt-5.4',
        );
      },
      inject: [ConfigService],
    },
    DiscordAgentService,
    DiscordAgentToolsService,
    DiscordChatHistoryService,
    DiscordRescheduleConfirmationService,
    DiscordMenuService,
  ],
})
export class DiscordChatModule {}
