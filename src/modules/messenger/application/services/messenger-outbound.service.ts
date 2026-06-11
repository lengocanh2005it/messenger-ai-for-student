import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import type { MessageSenderPort } from '../ports/message-sender.port';

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

@Injectable()
export class MessengerOutboundService implements MessageSenderPort {
  constructor(
    private readonly configService: ConfigService,
    @Inject(MESSENGER_REPOSITORY)
    private readonly repository: MessengerRepositoryPort,
  ) {}

  async sendTextViaPsid(params: {
    psid: string;
    text: string;
    messageType: string;
    userId?: number;
  }): Promise<void> {
    try {
      await this.callSendApiByPsid(params.psid, { text: params.text });
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

  private async callSendApiByPsid(
    psid: string,
    message: Record<string, unknown>,
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
        message,
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
