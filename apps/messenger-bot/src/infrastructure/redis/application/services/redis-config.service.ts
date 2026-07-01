import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisConfigService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.readBoolean('REDIS_ENABLED', false);
  }

  getHost(): string {
    return this.configService.get<string>('REDIS_HOST')?.trim() || '127.0.0.1';
  }

  getPort(): number {
    return this.readPositiveInt('REDIS_PORT', 6379);
  }

  getPassword(): string | undefined {
    const raw = this.configService.get<string>('REDIS_PASSWORD')?.trim();
    return raw || undefined;
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key)?.trim().toLowerCase();
    if (!raw) {
      return fallback;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  private readPositiveInt(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key)?.trim();
    if (!raw) {
      return fallback;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return Math.floor(value);
  }
}
