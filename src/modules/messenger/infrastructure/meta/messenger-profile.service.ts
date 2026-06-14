import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PERSISTENT_MENU_ACTIONS = [
  {
    type: 'postback' as const,
    title: 'Nhắc lịch học',
    payload: 'VIEW_UPCOMING_STUDY_SESSION',
  },
  {
    type: 'postback' as const,
    title: 'Xem tiến độ',
    payload: 'VIEW_LEARNING_PROGRESS',
  },
  {
    type: 'postback' as const,
    title: 'Đăng ký báo cáo',
    payload: 'REGISTER_LEARNING_REPORT',
  },
];

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
      persistent_menu: [
        {
          locale: 'default',
          composer_input_disabled: false,
          call_to_actions: PERSISTENT_MENU_ACTIONS,
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
