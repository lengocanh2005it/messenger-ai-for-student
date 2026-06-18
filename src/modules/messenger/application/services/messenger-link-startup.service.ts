import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MessengerLinkStartupService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (this.isTestRuntime()) {
      return;
    }

    const mode = this.configService.get<string>('MESSENGER_LINK_MODE')?.trim();
    if (mode && mode.toLowerCase() !== 'token') {
      throw new InternalServerErrorException(
        `MESSENGER_LINK_MODE must be "token" (got "${mode}") — legacy ref=userId linking was removed`,
      );
    }

    const verifyUrl = this.configService
      .get<string>('WISPACE_API_VERIFY_MESSENGER_TOKEN_URL')
      ?.trim();
    if (!verifyUrl) {
      throw new InternalServerErrorException(
        'WISPACE_API_VERIFY_MESSENGER_TOKEN_URL must be set — Messenger account linking requires WISPACE token verify',
      );
    }

    const internalKey = this.configService
      .get<string>('WISPACE_INTERNAL_KEY')
      ?.trim();
    if (!internalKey) {
      throw new InternalServerErrorException(
        'WISPACE_INTERNAL_KEY must be set for messenger link token verify',
      );
    }
  }

  private isTestRuntime(): boolean {
    return this.configService.get<string>('NODE_ENV')?.trim() === 'test';
  }
}
