import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

interface PendingJoinEntry {
  discordUserId: string;
  wispaceUserId: number;
  discordUsername: string;
  expiresAt: number;
}

const TTL_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class DiscordPendingJoinService {
  private readonly store = new Map<string, PendingJoinEntry>();

  create(
    discordUserId: string,
    wispaceUserId: number,
    discordUsername: string,
  ): string {
    const token = randomUUID();
    this.store.set(token, {
      discordUserId,
      wispaceUserId,
      discordUsername,
      expiresAt: Date.now() + TTL_MS,
    });
    return token;
  }

  get(token: string): PendingJoinEntry | undefined {
    const entry = this.store.get(token);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(token);
      return undefined;
    }
    return entry;
  }

  delete(token: string): void {
    this.store.delete(token);
  }
}
