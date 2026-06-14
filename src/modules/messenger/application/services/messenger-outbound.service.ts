import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isMessenger24hWindowError } from '../messages/chat-delivery.messages';
import {
  buildProactive24hLogErrorMessage,
  buildProactiveFailureMessageType,
} from '../utils/proactive-send.utils';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import type { MessageSenderPort } from '../ports/message-sender.port';
import { splitMessengerBubbles } from '../../../../shared/utils/messenger-text.utils';
import type { MessengerRichFollowUp } from '../../domain/entities/messenger-rich-message.types';

export class MessengerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = 'MessengerApiError';
  }
}

/** H4: at least one bubble was delivered before a later Send API failure. */
export class MessengerPartialSendError extends MessengerApiError {
  constructor(
    readonly bubblesSent: number,
    cause: MessengerApiError,
  ) {
    super(cause.message, cause.status, cause.statusText, cause.responseBody);
    this.name = 'MessengerPartialSendError';
  }
}

export type MessengerSenderAction = 'mark_seen' | 'typing_on' | 'typing_off';

@Injectable()
export class MessengerOutboundService implements MessageSenderPort {
  constructor(
    private readonly configService: ConfigService,
    @Inject(MESSENGER_REPOSITORY)
    private readonly repository: MessengerRepositoryPort,
  ) {}

  async sendSenderAction(
    psid: string,
    senderAction: MessengerSenderAction,
  ): Promise<void> {
    await this.callSendApiByPsid(psid, {
      sender_action: senderAction,
    });
  }

  async sendTextBubblesViaPsid(params: {
    psid: string;
    text: string;
    messageType: string;
    userId?: number;
    maxBubbles?: number;
    maxCharsPerBubble?: number;
  }): Promise<number> {
    const bubbles = splitMessengerBubbles(
      params.text,
      params.maxBubbles ?? 4,
      params.maxCharsPerBubble ?? 640,
    );

    if (!bubbles.length) {
      return 0;
    }

    let sentCount = 0;

    for (const [index, bubble] of bubbles.entries()) {
      try {
        await this.sendTextViaPsid({
          psid: params.psid,
          userId: params.userId,
          text: bubble,
          messageType:
            bubbles.length > 1
              ? `${params.messageType}_PART_${index + 1}_OF_${bubbles.length}`
              : params.messageType,
        });
        sentCount += 1;
      } catch (error) {
        const apiError = this.toMessengerApiError(params.psid, error);
        if (sentCount > 0) {
          throw new MessengerPartialSendError(sentCount, apiError);
        }

        throw apiError;
      }
    }

    return sentCount;
  }

  async sendRichFollowUps(params: {
    psid: string;
    userId?: number;
    followUps: MessengerRichFollowUp[];
  }): Promise<void> {
    for (const followUp of params.followUps) {
      if (followUp.kind === 'generic') {
        await this.sendGenericTemplate({
          psid: params.psid,
          userId: params.userId,
          messageType: followUp.messageType,
          elements: followUp.elements,
        });
        continue;
      }

      await this.sendButtonTemplate({
        psid: params.psid,
        userId: params.userId,
        messageType: followUp.messageType,
        text: followUp.text,
        buttons: followUp.buttons,
      });
    }
  }

  async sendGenericTemplate(params: {
    psid: string;
    userId?: number;
    messageType: string;
    elements: Array<{
      title: string;
      subtitle?: string;
      buttons?: Array<{
        type: 'postback';
        title: string;
        payload: string;
      }>;
    }>;
  }): Promise<void> {
    if (!params.elements.length) {
      return;
    }

    const payload = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: params.elements,
        },
      },
    };

    try {
      await this.callSendApiByPsid(params.psid, {
        message: payload,
      });
      await this.repository.logMessage({
        userId: params.userId,
        psid: params.psid,
        messageType: params.messageType,
        messageText: JSON.stringify(params.elements),
        status: 'SENT',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.repository.logMessage({
        userId: params.userId,
        psid: params.psid,
        messageType: params.messageType,
        messageText: JSON.stringify(params.elements),
        status: 'FAILED',
        errorMessage,
      });
      throw error;
    }
  }

  async sendButtonTemplate(params: {
    psid: string;
    userId?: number;
    messageType: string;
    text: string;
    buttons: Array<{
      type: 'postback';
      title: string;
      payload: string;
    }>;
  }): Promise<void> {
    if (!params.buttons.length) {
      return;
    }

    const payload = {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: params.text,
          buttons: params.buttons,
        },
      },
    };

    try {
      await this.callSendApiByPsid(params.psid, {
        message: payload,
      });
      await this.repository.logMessage({
        userId: params.userId,
        psid: params.psid,
        messageType: params.messageType,
        messageText: params.text,
        status: 'SENT',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.repository.logMessage({
        userId: params.userId,
        psid: params.psid,
        messageType: params.messageType,
        messageText: params.text,
        status: 'FAILED',
        errorMessage,
      });
      throw error;
    }
  }

  async sendTextViaPsid(params: {
    psid: string;
    text: string;
    messageType: string;
    userId?: number;
  }): Promise<void> {
    try {
      await this.callSendApiByPsid(params.psid, {
        message: { text: params.text },
      });
      await this.repository.logMessage({
        userId: params.userId,
        psid: params.psid,
        messageType: params.messageType,
        messageText: params.text,
        status: 'SENT',
      });
    } catch (error) {
      await this.logSendFailure(params, error);
      throw error;
    }
  }

  private async logSendFailure(
    params: {
      psid: string;
      text: string;
      messageType: string;
      userId?: number;
    },
    error: unknown,
  ): Promise<void> {
    const apiError = this.toMessengerApiError(params.psid, error);
    const is24h = isMessenger24hWindowError(apiError);
    const errorMessage = is24h
      ? buildProactive24hLogErrorMessage()
      : apiError.message;

    await this.repository.logMessage({
      userId: params.userId,
      psid: params.psid,
      messageType: is24h
        ? buildProactiveFailureMessageType(params.messageType)
        : params.messageType,
      messageText: params.text,
      status: 'FAILED',
      errorMessage,
    });
  }

  private toMessengerApiError(psid: string, error: unknown): MessengerApiError {
    if (error instanceof MessengerApiError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new MessengerApiError(
      `Messenger Send API failed for PSID ${psid}: ${message}`,
      0,
      'Error',
      message,
    );
  }

  private async callSendApiByPsid(
    psid: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const pageAccessToken = this.configService.get<string>('PAGE_ACCESS_TOKEN');
    const graphApiVersion =
      this.configService.get<string>('GRAPH_API_VERSION') ?? 'v21.0';

    if (!pageAccessToken) {
      throw new InternalServerErrorException('PAGE_ACCESS_TOKEN is missing');
    }

    const url = new URL(
      `https://graph.facebook.com/${graphApiVersion}/me/messages`,
    );
    url.searchParams.set('access_token', pageAccessToken);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: {
          id: psid,
        },
        ...payload,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new MessengerApiError(
        `Messenger Send API failed for PSID ${psid}: HTTP ${response.status} ${response.statusText} - ${body}`,
        response.status,
        response.statusText,
        body,
      );
    }
  }
}
