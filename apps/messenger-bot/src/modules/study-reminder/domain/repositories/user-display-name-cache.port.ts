export const USER_DISPLAY_NAME_CACHE = Symbol('USER_DISPLAY_NAME_CACHE');

export interface CachedUserDisplayName {
  displayName: string | null;
  username: string | null;
}

export interface UserDisplayNameCachePort {
  isAvailable(): boolean;
  get(userId: number): Promise<CachedUserDisplayName | null>;
  set(userId: number, value: CachedUserDisplayName): Promise<void>;
}
