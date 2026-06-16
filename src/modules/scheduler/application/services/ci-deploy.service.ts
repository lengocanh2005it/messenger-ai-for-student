import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const execFileAsync = promisify(execFile);

export interface CiDeployPayload {
  image?: string;
  forceRecreate?: boolean;
}

export interface CiDeployResult {
  accepted: boolean;
  skipped?: boolean;
  reason?: string;
  image?: string;
}

@Injectable()
export class CiDeployService {
  private readonly logger = new Logger(CiDeployService.name);
  private deployInFlight = false;
  private lastDeployStartedAt = 0;

  constructor(private readonly configService: ConfigService) {}

  scheduleDeploy(payload?: CiDeployPayload): CiDeployResult {
    if (!this.isEnabled()) {
      return {
        accepted: false,
        skipped: true,
        reason: 'ci_deploy_disabled',
      };
    }

    const image = payload?.image?.trim();
    if (!image) {
      throw new BadRequestException('image is required');
    }

    this.assertAllowedImage(image);

    const debounceSeconds = this.readDebounceSeconds();
    const now = Date.now();
    if (
      this.deployInFlight ||
      now - this.lastDeployStartedAt < debounceSeconds * 1000
    ) {
      return { accepted: true, reason: 'debounced_or_in_flight' };
    }

    const forceRecreate = payload?.forceRecreate === true;
    this.lastDeployStartedAt = now;
    this.deployInFlight = true;
    setImmediate(() => {
      void this.runDeploy(image, forceRecreate).finally(() => {
        this.deployInFlight = false;
      });
    });

    return { accepted: true, image };
  }

  private isEnabled(): boolean {
    return this.configService.get<string>('CI_DEPLOY_ENABLED') !== 'false';
  }

  private readDebounceSeconds(): number {
    const raw = Number(
      this.configService.get<string>('CI_DEPLOY_DEBOUNCE_SECONDS') ?? 30,
    );

    if (!Number.isFinite(raw) || raw < 0) {
      return 30;
    }

    return raw;
  }

  private assertAllowedImage(image: string): void {
    const prefix =
      this.configService.get<string>('CI_DEPLOY_IMAGE_PREFIX')?.trim() ??
      'ghcr.io/lengocanh2005it/messenger-ai-for-student:';

    if (!image.startsWith(prefix)) {
      throw new BadRequestException(`image must start with ${prefix}`);
    }
  }

  private async runDeploy(
    image: string,
    forceRecreate: boolean,
  ): Promise<void> {
    const deployDir = this.requireConfig('DEPLOY_DIR');
    const composeFile = this.requireConfig('DEPLOY_COMPOSE_FILE');
    const containerName =
      this.configService.get<string>('DEPLOY_CONTAINER_NAME')?.trim() ??
      'messenger-bot';

    this.logger.log(`CI_DEPLOY start image=${image}`);

    try {
      await this.dockerLoginIfConfigured();

      await execFileAsync('docker', ['pull', image], {
        maxBuffer: 10 * 1024 * 1024,
      });

      const upArgs = [
        'compose',
        '-f',
        composeFile,
        'up',
        '-d',
        '--remove-orphans',
        containerName,
      ];
      if (forceRecreate) {
        upArgs.splice(upArgs.length - 1, 0, '--force-recreate');
      }

      await execFileAsync('docker', upArgs, {
        cwd: deployDir,
        env: { ...process.env, IMAGE: image },
        maxBuffer: 10 * 1024 * 1024,
      });

      this.logger.log(`CI_DEPLOY complete image=${image}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`CI_DEPLOY failed: ${message}`);
    }
  }

  private async dockerLoginIfConfigured(): Promise<void> {
    const token = this.configService.get<string>('GHCR_PULL_TOKEN')?.trim();
    if (!token) {
      return;
    }

    const user =
      this.configService.get<string>('GHCR_USER')?.trim() ?? 'lengocanh2005it';

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        'docker',
        ['login', 'ghcr.io', '-u', user, '--password-stdin'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `docker login exited ${code}`));
      });

      proc.stdin.write(token);
      proc.stdin.end();
    });
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured`);
    }

    return value;
  }
}
