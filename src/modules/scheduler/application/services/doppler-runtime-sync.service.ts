import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const execFileAsync = promisify(execFile);

/** Writable in container; `/deploy/` is only a bind-mounted file, not a directory. */
export const DOPPLER_RUNTIME_ENV_SYNC_TMP = '/tmp/.env.sync.tmp';

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
          env: {
            ...process.env,
            DOPPLER_TOKEN: token,
            HOME: '/tmp',
            DOPPLER_CONFIG_DIR: '/tmp/.doppler',
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      await this.writeEnvAtomically(envFile, stdout);

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

      const hostCompose = await this.resolveHostComposeContext(
        containerName,
        envFile,
        composeFile,
      );

      await execFileAsync(
        'docker',
        [
          'compose',
          '-f',
          hostCompose.composeFile,
          'up',
          '-d',
          '--force-recreate',
          'messenger-bot',
        ],
        {
          cwd: hostCompose.deployDir,
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

  private async writeEnvAtomically(
    envFile: string,
    content: string,
  ): Promise<void> {
    await fs.writeFile(DOPPLER_RUNTIME_ENV_SYNC_TMP, content, { mode: 0o600 });
    try {
      await fs.copyFile(DOPPLER_RUNTIME_ENV_SYNC_TMP, envFile);
      await fs.chmod(envFile, 0o600);
    } finally {
      await fs.unlink(DOPPLER_RUNTIME_ENV_SYNC_TMP).catch(() => undefined);
    }
  }

  private async resolveHostComposeContext(
    containerName: string,
    envFile: string,
    composeFile: string,
  ): Promise<{ deployDir: string; composeFile: string }> {
    const configuredHostDir = this.configService
      .get<string>('DEPLOY_HOST_DIR')
      ?.trim();
    if (configuredHostDir) {
      return {
        deployDir: configuredHostDir,
        composeFile: path.posix.join(
          configuredHostDir,
          'docker-compose.prod.yml',
        ),
      };
    }

    const { stdout } = await execFileAsync('docker', [
      'inspect',
      containerName,
      '--format',
      '{{range .Mounts}}{{if eq .Destination "/deploy/.env"}}{{.Source}}{{end}}{{end}}',
    ]);
    const envSource = stdout.trim();
    if (envSource) {
      const deployDir = path.posix.dirname(envSource);
      return {
        deployDir,
        composeFile: path.posix.join(
          deployDir,
          path.posix.basename(composeFile),
        ),
      };
    }

    return {
      deployDir: path.posix.dirname(envFile),
      composeFile,
    };
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured`);
    }

    return value;
  }
}
