import { Injectable, Logger } from '@nestjs/common';
import type { ZaloWebhookHandler } from '../../../zalo-webhook/presentation/controllers/zalo-webhook.controller';
import { ZaloAgentService } from '../agent/zalo-agent.service';
import { ZaloOutboundService } from './zalo-outbound.service';
import { ZaloAccountLinkService } from '../../../zalo-oauth/application/services/zalo-account-link.service';

const FALLBACK_ERROR_MESSAGE =
  'Xin lỗi, mình gặp sự cố khi xử lý tin nhắn. Bạn thử lại sau ít phút nhé.';

const WELCOME_MESSAGE =
  'Chào bạn! Mình là trợ lý học tập WISPACE. Bạn có thể hỏi mình bất cứ điều gì, và nhắn "liên kết" để kết nối tài khoản WISPACE nhé 🎓';

/**
 * Orchestrates webhook message → account-link lookup → LLM agent →
 * outbound reply. Handles each message immediately, no debounce
 * (spec §4/Global Constraints).
 */
@Injectable()
export class ZaloChatService implements ZaloWebhookHandler {
  private readonly logger = new Logger(ZaloChatService.name);

  constructor(
    private readonly agentService: ZaloAgentService,
    private readonly outboundService: ZaloOutboundService,
    private readonly accountLinkService: ZaloAccountLinkService,
  ) {}

  async handleIncomingMessage(zaloUserId: string, text: string): Promise<void> {
    try {
      const userId =
        await this.accountLinkService.findUserIdByZaloId(zaloUserId);
      const reply = await this.agentService.reply({
        zaloUserId,
        userId,
        userText: text,
      });
      await this.outboundService.sendText(zaloUserId, reply.text);
    } catch (error) {
      this.logger.error(
        `Chat reply failed for zaloUserId=${zaloUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.outboundService.sendText(zaloUserId, FALLBACK_ERROR_MESSAGE);
    }
  }

  async handleFollow(zaloUserId: string): Promise<void> {
    await this.outboundService.sendText(zaloUserId, WELCOME_MESSAGE);
  }
}
