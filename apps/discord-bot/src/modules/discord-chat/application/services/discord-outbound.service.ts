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
    try {
      const user = await this.client.users.fetch(discordUserId);
      await user.send(text);
    } catch (error) {
      this.logger.warn(
        `Failed to send DM to discordUserId=${discordUserId}: ${
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
