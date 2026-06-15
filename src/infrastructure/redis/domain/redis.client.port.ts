import type Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export type RedisPingStatus = 'disabled' | 'ok' | 'error';

export interface RedisPingResult {
  status: RedisPingStatus;
  latencyMs?: number;
  message?: string;
}

export interface RedisClientPort {
  isEnabled(): boolean;
  ping(): Promise<RedisPingResult>;
  /** Native client for future phases (R1+). Null when Redis is disabled. */
  getNativeClient(): Redis | null;
}
