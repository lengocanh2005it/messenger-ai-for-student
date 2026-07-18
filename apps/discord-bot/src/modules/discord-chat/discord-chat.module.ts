import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createLlmProviderAdapter,
  createFailoverLlmProviderAdapter,
  type LlmProviderAdapter,
  type LlmProviderEntryConfig,
} from '@wispace/llm-agent';
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
        const orderRaw = configService
          .get<string>('LLM_PROVIDER_FAILOVER_ORDER')
          ?.trim();
        const order = orderRaw
          ? orderRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        if (order.length === 0) {
          return createLlmProviderAdapter({
            getApiKey: () =>
              configService.get<string>('OPENAI_API_KEY')?.trim() || undefined,
            getModel: () =>
              configService.get<string>('OPENAI_MODEL')?.trim() || 'gpt-5.4',
            provider: 'openai',
          });
        }

        const entries: LlmProviderEntryConfig[] = [
          {
            provider: 'openai',
            getApiKey: () =>
              configService.get<string>('OPENAI_API_KEY')?.trim() || undefined,
            getModel: () =>
              configService.get<string>('OPENAI_MODEL')?.trim() || 'gpt-5.4',
          },
          {
            provider: 'openrouter',
            getApiKey: () =>
              configService.get<string>('OPENROUTER_API_KEY')?.trim() ||
              undefined,
            getModel: () =>
              configService.get<string>('OPENROUTER_MODEL')?.trim() ||
              'openai/gpt-4o-mini',
            getBaseUrl: () =>
              configService.get<string>('OPENROUTER_BASE_URL')?.trim() ||
              'https://openrouter.ai/api/v1',
          },
          {
            provider: 'minimax',
            getApiKey: () =>
              configService.get<string>('MINIMAX_API_KEY')?.trim() || undefined,
            getModel: () =>
              configService.get<string>('MINIMAX_MODEL')?.trim() ||
              'MiniMax-Text-01',
            getBaseUrl: () =>
              configService.get<string>('MINIMAX_BASE_URL')?.trim() ||
              'https://api.minimax.chat/v1',
          },
        ];

        return createFailoverLlmProviderAdapter(entries, order, {
          warn: (msg) => console.warn(msg),
        });
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
