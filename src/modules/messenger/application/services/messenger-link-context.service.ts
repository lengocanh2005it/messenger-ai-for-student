import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessengerLinkContext,
  parseMessengerLinkContext,
} from '../../../../shared/config/poc.constants';
import type { MessengerLinkResolveOutcome } from '../../domain/types/messenger-link-verify.types';
import { WispaceMessengerTokenVerifyService } from '../../infrastructure/wispace/wispace-messenger-token-verify.service';

@Injectable()
export class MessengerLinkContextService {
  private readonly logger = new Logger(MessengerLinkContextService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly wispaceTokenVerifyService: WispaceMessengerTokenVerifyService,
  ) {}

  isTokenLinkMode(): boolean {
    const mode = this.configService.get<string>('MESSENGER_LINK_MODE')?.trim();
    if (mode) {
      return mode.toLowerCase() === 'token';
    }

    return Boolean(
      this.configService
        .get<string>('WISPACE_API_VERIFY_MESSENGER_TOKEN_URL')
        ?.trim(),
    );
  }

  async resolveFromRef(
    psid: string,
    input: {
      ref?: string | null;
      topic?: string | null;
      cadence?: string | null;
    },
  ): Promise<MessengerLinkResolveOutcome> {
    const ref = input.ref?.trim();
    if (!ref) {
      return {};
    }

    if (!this.isTokenLinkMode()) {
      const context = parseMessengerLinkContext(input);
      return context ? { context } : {};
    }

    try {
      const verified =
        await this.wispaceTokenVerifyService.verifyMessengerToken(psid, ref);

      if (!verified.valid) {
        this.logger.warn(
          `Messenger link verify failed psid=${psid} reason=${verified.reason}`,
        );
        return { verifyFailureReason: verified.reason };
      }

      return {
        context: {
          ref,
          userId: verified.userId,
          topic: input.topic?.trim() || verified.topic,
          cadence: verified.cadence,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Messenger link verify error psid=${psid}: ${message}`);
      return { verifyFailureReason: 'NOT_FOUND' };
    }
  }

  resolveFromMapping(mapping: {
    userId: number;
    topic?: string | null;
    cadence?: MessengerLinkContext['cadence'] | null;
  }): MessengerLinkContext | undefined {
    return parseMessengerLinkContext({
      ref: String(mapping.userId),
      topic: mapping.topic,
      cadence: mapping.cadence,
    });
  }
}
