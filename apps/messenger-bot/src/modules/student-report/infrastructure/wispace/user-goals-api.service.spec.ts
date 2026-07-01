import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserGoalsApiService } from './user-goals-api.service';

describe('UserGoalsApiService', () => {
  const createService = (env: Record<string, string | undefined>) => {
    const configService = {
      get: (key: string) => env[key],
    } as ConfigService;

    return new UserGoalsApiService(configService);
  };

  describe('buildWispaceHeaders', () => {
    it('includes x-psid and X-Internal-Key', () => {
      const service = createService({
        WISPACE_INTERNAL_KEY: 'secret-internal-key',
      });

      expect(service.buildWispaceHeaders('  psid-123  ')).toEqual({
        'x-psid': 'psid-123',
        'X-Internal-Key': 'secret-internal-key',
        Accept: 'application/json',
      });
    });

    it('throws when PSID is empty', () => {
      const service = createService({
        WISPACE_INTERNAL_KEY: 'secret-internal-key',
      });

      expect(() => service.buildWispaceHeaders('   ')).toThrow(
        InternalServerErrorException,
      );
    });

    it('throws when WISPACE_INTERNAL_KEY is missing', () => {
      const service = createService({});

      expect(() => service.buildWispaceHeaders('psid-123')).toThrow(
        InternalServerErrorException,
      );
    });
  });
});
