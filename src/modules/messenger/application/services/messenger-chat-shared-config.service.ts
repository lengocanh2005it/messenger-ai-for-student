import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MessengerChatSharedConfigService {
  constructor(private readonly configService: ConfigService) {}

  isSharedQueueEnabled(): boolean {
    return this.readBoolean('CHAT_QUEUE_SHARED', false);
  }

  getProcessingStuckMs(): number {
    return this.readPositiveInt('CHAT_QUEUE_PROCESSING_STUCK_MS', 300_000);
  }

  getWebhookDedupeRetentionMs(): number {
    return this.readPositiveInt('CHAT_WEBHOOK_DEDUPE_RETENTION_MS', 86_400_000);
  }

  getHistoryTtlMs(): number {
    return this.readPositiveInt('CHAT_HISTORY_TTL_MS', 30 * 60 * 1000);
  }

  getHistoryMaxMessages(): number {
    return this.readPositiveInt('CHAT_HISTORY_MAX_MESSAGES', 12);
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key)?.trim().toLowerCase();
    if (!raw) {
      return fallback;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  private readPositiveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key)?.trim();
    if (!raw) {
      return fallback;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return Math.floor(value);
  }
}
