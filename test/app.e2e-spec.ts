import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppModule } from './../src/app.module';

interface TestDatabase {
  mappings: Array<{
    userId?: number;
    psid: string;
    ref?: string;
    status: string;
  }>;
  logs: Array<{
    userId?: number;
    psid?: string;
    messageType: string;
    status: string;
  }>;
}

interface TestSendResponse {
  ok: boolean;
  message: string;
}

interface MessengerProfilePayload {
  get_started: {
    payload: string;
  };
  greeting: Array<{
    text: string;
  }>;
  persistent_menu: Array<{
    call_to_actions: unknown[];
  }>;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let dbPath: string;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `messenger-test-${randomUUID()}.json`);
    process.env.PAGE_ACCESS_TOKEN = 'test-page-access-token';
    process.env.VERIFY_TOKEN = 'wispace_verify_token';
    process.env.GRAPH_API_VERSION = 'v25.0';
    process.env.MESSENGER_PAGE_ID = '1192471430606671';
    process.env.MESSENGER_DB_PATH = dbPath;
    process.env.MESSENGER_WEBHOOK_SIGNATURE_VERIFY = 'false';

    fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(''),
      }),
    );
    global.fetch = fetchMock;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Messenger AI Notification API is running');
  });

  it('/webhook (GET) verifies Meta challenge', () => {
    return request(app.getHttpServer())
      .get('/webhook')
      .query({
        'hub.verify_token': 'wispace_verify_token',
        'hub.challenge': 'challenge-123',
      })
      .expect(200)
      .expect('challenge-123');
  });

  it('/webhook (POST) handles Get Started referral and sends welcome message', async () => {
    await request(app.getHttpServer())
      .post('/webhook')
      .send({
        object: 'page',
        entry: [
          {
            messaging: [
              {
                sender: {
                  id: '123456789',
                },
                postback: {
                  payload: 'GET_STARTED',
                  referral: {
                    ref: '12345',
                    source: 'SHORTLINK',
                    type: 'OPEN_THREAD',
                  },
                },
              },
            ],
          },
        ],
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          ok: true,
          processed: 1,
          failures: [],
        });
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain(
      'https://graph.facebook.com/v25.0/me/messages',
    );
    expect(String(url)).toContain('access_token=test-page-access-token');
    expect(JSON.parse(options.body as string)).toEqual({
      recipient: {
        id: '123456789',
      },
      message: {
        text: 'Chào bạn! WISPACE đã kết nối Messenger thành công. Từ bây giờ bạn có thể nhận báo cáo học tập tại đây.',
      },
    });

    const db = JSON.parse(await readFile(dbPath, 'utf8')) as TestDatabase;
    expect(db.mappings[0]).toMatchObject({
      userId: 12345,
      psid: '123456789',
      ref: '12345',
      status: 'ACTIVE',
    });
    expect(db.logs[0]).toMatchObject({
      userId: 12345,
      psid: '123456789',
      messageType: 'WELCOME',
      status: 'SENT',
    });
  });

  it('/messenger/test-send sends hardcoded learning report', async () => {
    await request(app.getHttpServer())
      .post('/messenger/test-send')
      .send({
        psid: '123456789',
      })
      .expect(200)
      .expect((response) => {
        const body = response.body as TestSendResponse;
        expect(body.ok).toBe(true);
        expect(body.message).toContain('Báo cáo học tập hôm nay:');
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(options.body as string)).toEqual({
      recipient: {
        id: '123456789',
      },
      message: {
        text: [
          'Báo cáo học tập hôm nay:',
          '',
          'Reading: 6.0',
          'Listening: 5.5',
          'Writing: 5.0',
          '',
          'Gợi ý: Bạn nên tập trung luyện Listening trong tuần này.',
        ].join('\n'),
      },
    });
  });

  it('/messenger/profile/setup configures Get Started, greeting, and menu', async () => {
    await request(app.getHttpServer())
      .post('/messenger/profile/setup')
      .send({})
      .expect(200)
      .expect({
        ok: true,
      });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const deleteCall = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(deleteCall[0])).toContain(
      'https://graph.facebook.com/v25.0/me/messenger_profile',
    );
    expect(deleteCall[1].method).toBe('DELETE');

    const [url, options] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(String(url)).toContain(
      'https://graph.facebook.com/v25.0/me/messenger_profile',
    );
    const payload = JSON.parse(
      options.body as string,
    ) as MessengerProfilePayload;
    expect(payload.get_started).toEqual({
      payload: 'GET_STARTED',
    });
    expect(payload.greeting[0].text).toContain('WISPACE');
    expect(payload.persistent_menu[0].call_to_actions).toHaveLength(1);
    expect(payload.persistent_menu[0].call_to_actions).toEqual([
      {
        type: 'postback',
        title: 'Đăng ký báo cáo',
        payload: 'REGISTER_LEARNING_REPORT',
      },
    ]);
  });

  afterEach(async () => {
    await app.close();
    await rm(dbPath, { force: true });
  });
});
