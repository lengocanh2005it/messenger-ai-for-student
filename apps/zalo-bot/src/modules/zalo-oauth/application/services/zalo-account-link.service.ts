import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { ZaloAccountLinkEntity } from '../../../../infrastructure/database/entities/zalo-account-link.entity';

const PLATFORM = 'zalo' as const;
const ZALO_TOKEN_ENDPOINT = 'https://oauth.zaloapp.com/v4/access_token';
const ZALO_ME_ENDPOINT = 'https://graph.zalo.me/v2.0/me';

class ZaloOauthError extends Error {}

function base64url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Zalo Login OAuth (PKCE) + account-linking to WISPACE userId — Zalo
 * counterpart to apps/discord-bot's DiscordAccountLinkService. Zalo Login
 * requires PKCE, unlike Discord's plain OAuth2 (spec §5.2).
 */
@Injectable()
export class ZaloAccountLinkService {
  private readonly logger = new Logger(ZaloAccountLinkService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ZaloAccountLinkEntity)
    private readonly repo: Repository<ZaloAccountLinkEntity>,
    private readonly httpFetch: typeof fetch = fetch,
  ) {}

  buildPkcePair(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = base64url(randomBytes(32));
    const codeChallenge = base64url(
      createHash('sha256').update(codeVerifier).digest(),
    );
    return { codeVerifier, codeChallenge };
  }

  async exchangeCodeForZaloUser(
    code: string,
    codeVerifier: string,
  ): Promise<{ id: string; name: string }> {
    const appId = this.configService.getOrThrow<string>('ZALO_APP_ID');
    const secretKey = this.configService.getOrThrow<string>(
      'ZALO_APP_SECRET_KEY',
    );

    const tokenResponse = await this.httpFetch(ZALO_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: secretKey,
      },
      body: new URLSearchParams({
        code,
        app_id: appId,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      throw new ZaloOauthError(
        `Zalo token exchange failed: ${tokenResponse.status}`,
      );
    }

    const tokenJson = (await tokenResponse.json()) as { access_token: string };

    const userResponse = await this.httpFetch(
      `${ZALO_ME_ENDPOINT}?fields=id,name`,
      { headers: { access_token: tokenJson.access_token } },
    );

    if (!userResponse.ok) {
      throw new ZaloOauthError(
        `Zalo user fetch failed: ${userResponse.status}`,
      );
    }

    const userJson = (await userResponse.json()) as {
      id: string;
      name: string;
    };
    return { id: userJson.id, name: userJson.name };
  }

  async upsertLink(userId: number, zaloUserId: string): Promise<void> {
    await this.repo.manager.transaction(async (em) => {
      await em.query(
        `DELETE FROM zalo_account_links WHERE platform = $1 AND user_id = $2 AND external_user_id != $3`,
        [PLATFORM, userId, zaloUserId],
      );
      await em.query(
        `
          INSERT INTO zalo_account_links (platform, external_user_id, user_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (platform, external_user_id)
          DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = now()
        `,
        [PLATFORM, zaloUserId, userId],
      );
    });

    this.logger.log(
      `Linked Zalo account zaloUserId=${zaloUserId} userId=${userId}`,
    );
  }

  async findUserIdByZaloId(zaloUserId: string): Promise<number | undefined> {
    const row = await this.repo.findOne({
      where: { platform: PLATFORM, externalUserId: zaloUserId },
      select: { userId: true },
    });
    return row?.userId;
  }
}
