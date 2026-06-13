import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReportCronLeaderService } from './report-cron-leader.service';

describe('ReportCronLeaderService', () => {
  const createService = (values: Record<string, string | undefined>) => {
    const service = new ReportCronLeaderService({
      get: (key: string) => values[key],
    } as ConfigService);

    return service;
  };

  it('runs cron on all instances when CRON_LEADER_ENABLED is false (R4 default)', () => {
    const service = createService({
      CRON_LEADER_ENABLED: 'false',
    });

    expect(service.shouldRunScheduledReportCron()).toBe(true);
  });

  it('runs cron only on leader instance when enabled (R4)', () => {
    const service = createService({
      CRON_LEADER_ENABLED: 'true',
      CRON_LEADER_INSTANCE_ID: 'pod-a',
      INSTANCE_ID: 'pod-a',
    });

    expect(service.shouldRunScheduledReportCron()).toBe(true);
  });

  it('skips cron on non-leader instance when enabled (R4)', () => {
    const service = createService({
      CRON_LEADER_ENABLED: 'true',
      CRON_LEADER_INSTANCE_ID: 'pod-a',
      INSTANCE_ID: 'pod-b',
    });

    expect(service.shouldRunScheduledReportCron()).toBe(false);
  });
});
