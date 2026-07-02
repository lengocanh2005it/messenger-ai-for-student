import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ChatDailyUsageEntity,
  ChatIdempotencyEntity,
  LlmSafetyEventEntity,
  LlmUsageEventEntity,
} from '@wispace/chat-metering';
import { ChatRateLimitConfigService } from './application/services/chat-rate-limit-config.service';
import { DiscordChatRateLimitService } from './application/services/discord-chat-rate-limit.service';
import { LlmUsageConfigService } from './application/services/llm-usage-config.service';
import { DiscordLlmUsageRecorderService } from './application/services/discord-llm-usage-recorder.service';
import { DiscordLlmSafetyEventService } from './application/services/discord-llm-safety-event.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatDailyUsageEntity,
      ChatIdempotencyEntity,
      LlmUsageEventEntity,
      LlmSafetyEventEntity,
    ]),
  ],
  providers: [
    ChatRateLimitConfigService,
    DiscordChatRateLimitService,
    LlmUsageConfigService,
    DiscordLlmUsageRecorderService,
    DiscordLlmSafetyEventService,
  ],
  exports: [
    DiscordChatRateLimitService,
    DiscordLlmUsageRecorderService,
    DiscordLlmSafetyEventService,
  ],
})
export class ChatMeteringModule {}
