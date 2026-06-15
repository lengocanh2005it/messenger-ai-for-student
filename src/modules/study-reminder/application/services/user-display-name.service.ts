import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../../infrastructure/database/entities/user.entity';
import { MESSENGER_MAPPING_READER } from '../ports/messenger-mapping.port';
import type { MessengerMappingReaderPort } from '../ports/messenger-mapping.port';
import {
  USER_DISPLAY_NAME_CACHE,
  type UserDisplayNameCachePort,
} from '../../domain/repositories/user-display-name-cache.port';

const DEFAULT_DISPLAY_NAME = 'bạn';

@Injectable()
export class UserDisplayNameService implements OnModuleInit {
  private readonly logger = new Logger(UserDisplayNameService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @Inject(MESSENGER_MAPPING_READER)
    private readonly messengerMappingReader: MessengerMappingReaderPort,
    @Optional()
    @Inject(USER_DISPLAY_NAME_CACHE)
    private readonly displayNameCache?: UserDisplayNameCachePort,
  ) {}

  onModuleInit(): void {
    if (this.displayNameCache?.isAvailable()) {
      this.logger.log('User display name cache active=redis');
      return;
    }

    this.logger.log('User display name cache active=postgres (no redis cache)');
  }

  async resolveDisplayName(params: {
    userId?: number;
    psid?: string;
  }): Promise<string> {
    const userId = await this.resolveUserId(params);
    if (!userId) {
      return DEFAULT_DISPLAY_NAME;
    }

    if (this.displayNameCache?.isAvailable()) {
      const cached = await this.displayNameCache.get(userId);
      if (cached) {
        return this.pickDisplayName(cached.displayName, cached.username);
      }
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    const displayName = user?.displayName ?? null;
    const username = user?.username ?? null;

    if (this.displayNameCache?.isAvailable()) {
      await this.displayNameCache.set(userId, { displayName, username });
    }

    if (!user) {
      return DEFAULT_DISPLAY_NAME;
    }

    return this.pickDisplayName(displayName, username);
  }

  private pickDisplayName(
    displayName: string | null,
    username: string | null,
  ): string {
    const name = displayName?.trim();
    if (name) {
      return name;
    }

    const login = username?.trim();
    if (login) {
      return login;
    }

    return DEFAULT_DISPLAY_NAME;
  }

  private async resolveUserId(params: {
    userId?: number;
    psid?: string;
  }): Promise<number | undefined> {
    if (params.userId && params.userId > 0) {
      return params.userId;
    }

    if (!params.psid?.trim()) {
      return undefined;
    }

    const mapping = await this.messengerMappingReader.findActiveMappingByPsid(
      params.psid.trim(),
    );

    return mapping?.userId;
  }
}
