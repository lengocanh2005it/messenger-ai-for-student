import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';

@Injectable()
export class ChatRateLimitStartupService implements OnModuleInit {
  private readonly logger = new Logger(ChatRateLimitStartupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly chatRateLimitConfigService: ChatRateLimitConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.isProductionRuntime()) {
      return;
    }

    if (!this.chatRateLimitConfigService.isEnabled()) {
      this.logger.warn(
        'CHAT_RATE_LIMIT_ENABLED is false in production — free-form chat quota is not enforced (H1)',
      );
    }
  }

  private isProductionRuntime(): boolean {
    const nodeEnv = this.configService.get<string>('NODE_ENV')?.trim();
    if (nodeEnv === 'production') {
      return true;
    }

    const enforceProdQuota = this.configService
      .get<string>('ENFORCE_PROD_CHAT_QUOTA')
      ?.trim()
      .toLowerCase();

    return (
      enforceProdQuota === 'true' ||
      enforceProdQuota === '1' ||
      enforceProdQuota === 'yes'
    );
  }
}
