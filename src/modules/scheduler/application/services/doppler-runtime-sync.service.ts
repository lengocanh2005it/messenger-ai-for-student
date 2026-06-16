import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const execFileAsync = promisify(execFile);

export interface DopplerWebhookPayload {
  project?: { name?: string } | string;
  config?: { name?: string } | string;
  type?: string;
}

export interface DopplerRuntimeSyncResult {
  accepted: boolean;
  skipped?: boolean;
  reason?: string;
}

@Injectable()
export class DopplerRuntimeSyncService {
  private readonly logger = new Logger(DopplerRuntimeSyncService.name);
  private syncInFlight = false;
  private lastSyncStartedAt = 0;

  constructor(private readonly configService: ConfigService) {}

  scheduleSync(payload?: DopplerWebhookPayload): DopplerRuntimeSyncResult {
    if (!this.isEnabled()) {
      return {
        accepted: false,
        skipped: true,
        reason: 'runtime_sync_disabled',
      };
    }

    const skip = this.shouldSkipPayload(payload);
    if (skip) {
      return { accepted: false, skipped: true, reason: skip };
    }

    const debounceSeconds = this.readDebounceSeconds();
    const now = Date.now();
    if (
      this.syncInFlight ||
      now - this.lastSyncStartedAt < debounceSeconds * 1000
    ) {
      return { accepted: true, reason: 'debounced_or_in_flight' };
    }

    this.lastSyncStartedAt = now;
    this.syncInFlight = true;
    setImmediate(() => {
      void this.runSync().finally(() => {
        this.syncInFlight = false;
      });
    });

    return { accepted: true };
  }

  private isEnabled(): boolean {
    return (
      this.configService.get<string>('DOPPLER_RUNTIME_SYNC_ENABLED') === 'true'
    );
  }

  private shouldSkipPayload(payload?: DopplerWebhookPayload): string | null {
    if (!payload) {
      return null;
    }

    const expectedProject =
      this.configService.get<string>('DOPPLER_PROJECT')?.trim() ??
      'messenger-bot';
    const expectedConfig =
      this.configService.get<string>('DOPPLER_CONFIG')?.trim() ?? 'prd';

    const projectName = this.readName(payload.project);
    const configName = this.readName(payload.config);

    if (projectName && projectName !== expectedProject) {
      return 'project_mismatch';
    }

    if (configName && configName !== expectedConfig) {
      return 'config_mismatch';
    }

    return null;
  }

  private readName(value?: { name?: string } | string): string | undefined {
    if (typeof value === 'string') {
      return value.trim() || undefined;
    }

    return value?.name?.trim() || undefined;
  }

  private readDebounceSeconds(): number {
    const raw = Number(
      this.configService.get<string>('DOPPLER_RUNTIME_SYNC_DEBOUNCE_SECONDS') ??
        60,
    );

    if (!Number.isFinite(raw) || raw < 0) {
      return 60;
    }

    return raw;
  }

  private async runSync(): Promise<void> {
    const deployDir = this.requireConfig('DEPLOY_DIR');
    const envFile = this.requireConfig('DEPLOY_ENV_FILE');
    const composeFile = this.requireConfig('DEPLOY_COMPOSE_FILE');
    const containerName =
      this.configService.get<string>('DEPLOY_CONTAINER_NAME')?.trim() ??
      'messenger-bot';
    const project =
      this.configService.get<string>('DOPPLER_PROJECT')?.trim() ??
      'messenger-bot';
    const config =
      this.configService.get<string>('DOPPLER_CONFIG')?.trim() ?? 'prd';
    const token = this.requireConfig('DOPPLER_RUNTIME_TOKEN');

    this.logger.log(
      `DOPPLER_RUNTIME_SYNC start project=${project} config=${config}`,
    );

    try {
      const { stdout } = await execFileAsync(
        'doppler',
        [
          'secrets',
          'download',
          '--no-file',
          '--format',
          'env',
          '-p',
          project,
          '-c',
          config,
        ],
        {
          env: { ...process.env, DOPPLER_TOKEN: token },
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      const tmpFile = `${envFile}.tmp`;
      await fs.writeFile(tmpFile, stdout, { mode: 0o600 });
      await fs.rename(tmpFile, envFile);

      const { stdout: imageRaw } = await execFileAsync('docker', [
        'inspect',
        containerName,
        '--format',
        '{{.Config.Image}}',
      ]);
      const image = imageRaw.trim();
      if (!image) {
        throw new Error(`empty image from docker inspect ${containerName}`);
      }

      await execFileAsync(
        'docker',
        [
          'compose',
          '-f',
          composeFile,
          'up',
          '-d',
          '--force-recreate',
          'messenger-bot',
        ],
        {
          cwd: deployDir,
          env: { ...process.env, IMAGE: image },
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      this.logger.log(
        `DOPPLER_RUNTIME_SYNC complete image=${image} env=${envFile}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`DOPPLER_RUNTIME_SYNC failed: ${message}`);
    }
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured`);
    }

    return value;
  }
}
