import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CiDeployService } from './ci-deploy.service';

describe('CiDeployService', () => {
  const config = {
    CI_DEPLOY_ENABLED: 'true',
    CI_DEPLOY_IMAGE_PREFIX: 'ghcr.io/lengocanh2005it/messenger-ai-for-student:',
    DEPLOY_DIR: '/deploy',
    DEPLOY_COMPOSE_FILE: '/deploy/docker-compose.prod.yml',
  };

  const configService = {
    get: jest.fn((key: string) => config[key as keyof typeof config]),
  } as unknown as ConfigService;

  let service: CiDeployService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CiDeployService(configService);
  });

  it('rejects image outside allowed prefix', () => {
    expect(() =>
      service.scheduleDeploy({ image: 'docker.io/evil:latest' }),
    ).toThrow(BadRequestException);
  });

  it('accepts valid image and schedules deploy', () => {
    const result = service.scheduleDeploy({
      image: 'ghcr.io/lengocanh2005it/messenger-ai-for-student:abc123',
    });

    expect(result).toEqual({
      accepted: true,
      image: 'ghcr.io/lengocanh2005it/messenger-ai-for-student:abc123',
    });
  });

  it('returns skipped when disabled', () => {
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'CI_DEPLOY_ENABLED') {
        return 'false';
      }
      return config[key as keyof typeof config];
    });

    const disabled = new CiDeployService(configService);
    expect(
      disabled.scheduleDeploy({ image: config.CI_DEPLOY_IMAGE_PREFIX + 'x' }),
    ).toEqual({
      accepted: false,
      skipped: true,
      reason: 'ci_deploy_disabled',
    });
  });
});
