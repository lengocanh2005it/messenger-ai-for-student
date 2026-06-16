import { ConfigService } from '@nestjs/config';
import { DopplerRuntimeSyncService } from './doppler-runtime-sync.service';

describe('DopplerRuntimeSyncService', () => {
  const createService = (values: Record<string, string | undefined>) => {
    const config = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new DopplerRuntimeSyncService(config);
  };

  it('skips when runtime sync is disabled', () => {
    const service = createService({
      DOPPLER_RUNTIME_SYNC_ENABLED: 'false',
    });

    expect(service.scheduleSync()).toEqual({
      accepted: false,
      skipped: true,
      reason: 'runtime_sync_disabled',
    });
  });

  it('skips webhook for non-prd config', () => {
    const service = createService({
      DOPPLER_RUNTIME_SYNC_ENABLED: 'true',
      DOPPLER_PROJECT: 'messenger-bot',
      DOPPLER_CONFIG: 'prd',
    });

    expect(
      service.scheduleSync({
        project: 'messenger-bot',
        config: 'dev',
      }),
    ).toEqual({
      accepted: false,
      skipped: true,
      reason: 'config_mismatch',
    });
  });

  it('accepts prd webhook payload without running sync in unit test', () => {
    const setImmediateSpy = jest
      .spyOn(global, 'setImmediate')
      .mockImplementation(() => 0 as unknown as NodeJS.Immediate);

    const service = createService({
      DOPPLER_RUNTIME_SYNC_ENABLED: 'true',
      DOPPLER_PROJECT: 'messenger-bot',
      DOPPLER_CONFIG: 'prd',
      DEPLOY_DIR: '/deploy',
      DEPLOY_ENV_FILE: '/deploy/.env',
      DEPLOY_COMPOSE_FILE: '/deploy/docker-compose.prod.yml',
      DOPPLER_RUNTIME_TOKEN: 'dp.st.prd.test',
      DOPPLER_RUNTIME_SYNC_DEBOUNCE_SECONDS: '60',
    });

    const result = service.scheduleSync({
      project: { name: 'messenger-bot' },
      config: { name: 'prd' },
      type: 'secrets.update',
    });

    expect(result).toEqual({ accepted: true });
    setImmediateSpy.mockRestore();
  });
});
