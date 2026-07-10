export interface ToolResultCachePort {
  get(key: string): unknown;
  set(key: string, value: unknown, ttlMs: number): void;
  invalidate(key: string): void;
  /** Removes all keys whose string starts with the given prefix. */
  invalidatePrefix(prefix: string): void;
}

export const NOOP_TOOL_RESULT_CACHE: ToolResultCachePort = {
  get: () => undefined,
  set: () => undefined,
  invalidate: () => undefined,
  invalidatePrefix: () => undefined,
};
