import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MessengerProfileService {
  constructor(private readonly configService: ConfigService) {}

  async setupProfile(): Promise<{ ok: true }> {
    await this.callProfileApi({
      get_started: {
        payload: 'GET_STARTED',
      },
      greeting: [
        {
          locale: 'default',
          text: 'Chào bạn! Mở Menu để đăng ký nhận báo cáo hoặc xem tiến độ học tập ngay.',
        },
      ],
      persistent_menu: [
        {
          locale: 'default',
          composer_input_disabled: true,
          call_to_actions: [
            {
              type: 'postback',
              title: 'Đăng ký nhận báo cáo học tập',
              payload: 'GET_LEARNING_REPORT',
            },
            {
              type: 'postback',
              title: 'Xem tiến độ học tập',
              payload: 'VIEW_LEARNING_PROGRESS',
            },
          ],
        },
      ],
    });

    return { ok: true };
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
