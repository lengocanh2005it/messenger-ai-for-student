import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZaloTokenService } from './zalo-token.service';

/**
 * Refreshes the OA access_token proactively (every 45 min — access_token
 * lifetime is 1h, so this comfortably beats the 10-min buffer in
 * ZaloTokenService.getValidAccessToken) — see spec §5.1.
 */
@Injectable()
export class ZaloTokenRefreshService {
  private readonly logger = new Logger(ZaloTokenRefreshService.name);

  constructor(private readonly tokenService: ZaloTokenService) {}

  @Cron('0 */45 * * * *')
  async handleCron(): Promise<void> {
    try {
      await this.tokenService.refreshNow();
    } catch (error) {
      this.logger.error(
        `Zalo OA token refresh cron failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
