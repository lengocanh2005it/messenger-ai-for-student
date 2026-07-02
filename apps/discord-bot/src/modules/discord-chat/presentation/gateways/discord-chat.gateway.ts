import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from 'discord.js';
import { Button, Context, On, Once } from 'necord';
import type { ButtonContext, ContextOf } from 'necord';
import { DiscordAgentService } from '../../application/agent/discord-agent.service';
import { DiscordOutboundService } from '../../application/services/discord-outbound.service';
import { DiscordRescheduleConfirmationService } from '../../application/services/discord-reschedule-confirmation.service';
import {
  RESCHEDULE_CANCEL_CUSTOM_ID,
  RESCHEDULE_CONFIRM_CUSTOM_ID,
} from '../../application/constants/discord-reschedule.constants';
import { DiscordChatRateLimitService } from '../../../chat-metering/application/services/discord-chat-rate-limit.service';
import { buildChatQuotaDenyMessage } from '../../../chat-metering/application/messages/chat-quota.messages';
import { DiscordAccountLinkService } from '../../../account-link/application/services/discord-account-link.service';

const FALLBACK_ERROR_MESSAGE =
  'Xin lỗi, mình gặp sự cố khi xử lý tin nhắn. Bạn thử lại sau ít phút nhé.';

@Injectable()
export class DiscordChatGateway {
  private readonly logger = new Logger(DiscordChatGateway.name);

  constructor(
    private readonly agentService: DiscordAgentService,
    private readonly outboundService: DiscordOutboundService,
    private readonly rateLimitService: DiscordChatRateLimitService,
    private readonly accountLinkService: DiscordAccountLinkService,
    private readonly rescheduleConfirmationService: DiscordRescheduleConfirmationService,
  ) {}

  @Once('ready')
  onReady(@Context() [client]: ContextOf<'ready'>) {
    this.logger.log(`Discord bot online as ${client.user.tag}`);
  }

  @On('messageCreate')
  async onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>) {
    if (message.author.bot || message.channel.type !== ChannelType.DM) {
      return;
    }

    const userText = message.content.trim();
    if (!userText) {
      return;
    }

    const discordUserId = message.author.id;
    const idempotencyKey = `discord:${message.id}`;
    const quotaEnabled = this.rateLimitService.isEnabled();

    let usageDate: string | undefined;
    if (quotaEnabled) {
      const quota = await this.rateLimitService.reserveFreeFormSlot(
        discordUserId,
        { idempotencyKey },
      );
      usageDate = quota.usageDate;

      if (!quota.allowed) {
        if (quota.reason && quota.reason !== 'IDEMPOTENCY_CONFLICT') {
          await this.outboundService.sendText(
            discordUserId,
            buildChatQuotaDenyMessage(quota.reason, quota.limit),
          );
        }
        return;
      }
    }

    try {
      await message.channel.sendTyping();
      const userId =
        await this.accountLinkService.findUserIdByDiscordId(discordUserId);
      const reply = await this.agentService.reply({
        discordUserId,
        userId,
        userText,
        correlationId: message.id,
      });
      await this.outboundService.sendText(discordUserId, reply.text);

      if (quotaEnabled) {
        await this.rateLimitService.markCompleted(idempotencyKey);
      }
    } catch (error) {
      this.logger.error(
        `Chat reply failed for discordUserId=${discordUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (quotaEnabled && usageDate) {
        await this.rateLimitService.refundFreeFormSlot(
          discordUserId,
          usageDate,
          idempotencyKey,
        );
      }

      await this.outboundService.sendText(
        discordUserId,
        FALLBACK_ERROR_MESSAGE,
      );
    }
  }

  @Button(RESCHEDULE_CONFIRM_CUSTOM_ID)
  async onRescheduleConfirm(@Context() [interaction]: ButtonContext) {
    const discordUserId = interaction.user.id;
    const userId =
      await this.accountLinkService.findUserIdByDiscordId(discordUserId);
    const result = await this.rescheduleConfirmationService.confirm(
      discordUserId,
      userId,
    );

    await interaction.update({
      content: result.confirmed
        ? `Đã dời lịch sang ${result.scheduledTimeLabel}.`
        : result.message,
      components: [],
    });
  }

  @Button(RESCHEDULE_CANCEL_CUSTOM_ID)
  async onRescheduleCancel(@Context() [interaction]: ButtonContext) {
    const discordUserId = interaction.user.id;
    const message = this.rescheduleConfirmationService.cancel(discordUserId);

    await interaction.update({ content: message, components: [] });
  }
}
