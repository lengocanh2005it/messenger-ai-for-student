import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MessengerProfileService {
  constructor(private readonly configService: ConfigService) {}

  async setupProfile(): Promise<{ ok: true }> {
    await this.deletePersistentMenu();

    await this.callProfileApi({
      get_started: {
        payload: 'GET_STARTED',
      },
      greeting: [
        {
          locale: 'default',
          text: 'Chào bạn! Hỏi WISPACE về IELTS Writing, tiến độ học, lịch học hoặc báo cáo trước ngày thi — cứ nhắn tin tự nhiên nhé.',
        },
      ],
    });

    return { ok: true };
  }

  private async deletePersistentMenu(): Promise<void> {
    const pageAccessToken = this.configService.get<string>('PAGE_ACCESS_TOKEN');
    const graphApiVersion =
      this.configService.get<string>('GRAPH_API_VERSION') ?? 'v21.0';

    if (!pageAccessToken) {
      throw new InternalServerErrorException('PAGE_ACCESS_TOKEN is missing');
    }

    const url = new URL(
      `https://graph.facebook.com/${graphApiVersion}/me/messenger_profile`,
    );
    url.searchParams.set('access_token', pageAccessToken);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: ['persistent_menu'],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `Messenger Profile DELETE failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }
  }

  private async callProfileApi(payload: unknown): Promise<void> {
    const pageAccessToken = this.configService.get<string>('PAGE_ACCESS_TOKEN');
    const graphApiVersion =
      this.configService.get<string>('GRAPH_API_VERSION') ?? 'v21.0';

    if (!pageAccessToken) {
      throw new InternalServerErrorException('PAGE_ACCESS_TOKEN is missing');
    }

    const url = new URL(
      `https://graph.facebook.com/${graphApiVersion}/me/messenger_profile`,
    );
    url.searchParams.set('access_token', pageAccessToken);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `Messenger Profile API failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }
  }
}
