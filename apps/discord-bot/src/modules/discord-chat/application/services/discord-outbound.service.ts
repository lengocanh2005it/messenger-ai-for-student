import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
} from 'discord.js';
import {
  RESCHEDULE_CANCEL_CUSTOM_ID,
  RESCHEDULE_CONFIRM_CUSTOM_ID,
} from '../constants/discord-reschedule.constants';
import {
  MENU_LEARNING_PROGRESS_CUSTOM_ID,
  MENU_UPCOMING_SESSIONS_CUSTOM_ID,
} from '../constants/discord-menu.constants';

/**
 * Discord counterpart to Messenger's `MessageSenderPort` — sends by fetching
 * the DM channel from the Discord user id rather than replying inline on the
 * gateway event, so proactive sends (future study-reminder dispatch) can
 * reuse this later.
 */
@Injectable()
export class DiscordOutboundService {
  private readonly logger = new Logger(DiscordOutboundService.name);

  constructor(private readonly client: Client) {}

  async sendText(discordUserId: string, text: string): Promise<void> {
    await this.sendTextAndGetChannelId(discordUserId, text);
  }

  /** Sends a DM and returns the DM channel id (used to build deep links). */
  async sendTextAndGetChannelId(
    discordUserId: string,
    text: string,
  ): Promise<string | undefined> {
    try {
      const user = await this.client.users.fetch(discordUserId);
      const msg = await user.send(text);
      return msg.channelId;
    } catch (error) {
      this.logger.warn(
        `Failed to send DM to discordUserId=${discordUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return undefined;
    }
  }

  /** Sends a persistent quick-action menu with 3 buttons. Safe to click after bot restarts. */
  async sendMenuButtons(discordUserId: string): Promise<void> {
    try {
      const user = await this.client.users.fetch(discordUserId);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(MENU_UPCOMING_SESSIONS_CUSTOM_ID)
          .setLabel('📅 Lịch học sắp tới')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(MENU_LEARNING_PROGRESS_CUSTOM_ID)
          .setLabel('📊 Xem tiến độ')
          .setStyle(ButtonStyle.Primary),
      );
      await user.send({ components: [row] });
    } catch (error) {
      this.logger.warn(
        `Failed to send menu buttons to discordUserId=${discordUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Discord counterpart to Messenger's postback confirm/cancel buttons. */
  async sendRescheduleConfirmation(
    discordUserId: string,
    summary: string,
  ): Promise<void> {
    try {
      const user = await this.client.users.fetch(discordUserId);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(RESCHEDULE_CONFIRM_CUSTOM_ID)
          .setLabel('Xác nhận')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(RESCHEDULE_CANCEL_CUSTOM_ID)
          .setLabel('Hủy')
          .setStyle(ButtonStyle.Danger),
      );
      await user.send({ content: summary, components: [row] });
    } catch (error) {
      this.logger.warn(
        `Failed to send reschedule confirmation to discordUserId=${discordUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
