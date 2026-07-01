import { ConfigService } from '@nestjs/config';
import { RedisConfigService } from './redis-config.service';

describe('RedisConfigService', () => {
  const createService = (env: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;

    return new RedisConfigService(configService);
  };

  it('is disabled by default', () => {
    const service = createService({});
    expect(service.isEnabled()).toBe(false);
  });

  it('reads enabled flag and connection settings', () => {
    const service = createService({
      REDIS_ENABLED: 'true',
      REDIS_HOST: '69.62.74.196',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: 'secret',
    });

    expect(service.isEnabled()).toBe(true);
    expect(service.getHost()).toBe('69.62.74.196');
    expect(service.getPort()).toBe(6379);
    expect(service.getPassword()).toBe('secret');
  });

  it('falls back to localhost defaults when host/port missing', () => {
    const service = createService({
      REDIS_ENABLED: '1',
    });

    expect(service.getHost()).toBe('127.0.0.1');
    expect(service.getPort()).toBe(6379);
    expect(service.getPassword()).toBeUndefined();
  });
});
