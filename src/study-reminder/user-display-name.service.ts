import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../database/entities/user.entity';
import { MessengerRepository } from '../messenger/messenger.repository';

const DEFAULT_DISPLAY_NAME = 'bạn';

@Injectable()
export class UserDisplayNameService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly messengerRepository: MessengerRepository,
  ) {}

  async resolveDisplayName(params: {
    userId?: number;
    psid?: string;
  }): Promise<string> {
    const userId = await this.resolveUserId(params);
    if (!userId) {
      return DEFAULT_DISPLAY_NAME;
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return DEFAULT_DISPLAY_NAME;
    }

    const displayName = user.displayName?.trim();
    if (displayName) {
      return displayName;
    }

    const username = user.username?.trim();
    if (username) {
      return username;
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

    const mapping = await this.messengerRepository.findActiveMappingByPsid(
      params.psid.trim(),
    );

    return mapping?.userId;
  }
}
