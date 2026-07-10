import { InMemoryToolResultCache } from './in-memory-tool-result-cache';

describe('InMemoryToolResultCache', () => {
  it('returns undefined for cache miss', () => {
    const cache = new InMemoryToolResultCache();
    expect(cache.get('missing-key')).toBeUndefined();
  });

  it('returns value after set', () => {
    const cache = new InMemoryToolResultCache();
    cache.set('key', { data: 'test' }, 60_000);
    expect(cache.get('key')).toEqual({ data: 'test' });
  });

  it('returns undefined after TTL expires', () => {
    const cache = new InMemoryToolResultCache();
    cache.set('key', { data: 'test' }, -1); // already expired
    expect(cache.get('key')).toBeUndefined();
  });

  it('invalidate removes specific key', () => {
    const cache = new InMemoryToolResultCache();
    cache.set('key-a', 'a', 60_000);
    cache.set('key-b', 'b', 60_000);
    cache.invalidate('key-a');
    expect(cache.get('key-a')).toBeUndefined();
    expect(cache.get('key-b')).toBe('b');
  });

  it('invalidatePrefix removes all keys starting with prefix', () => {
    const cache = new InMemoryToolResultCache();
    cache.set('user123:list_study_calendar_entries:abc', 'x', 60_000);
    cache.set('user123:list_study_calendar_entries:def', 'y', 60_000);
    cache.set('user123:get_user_goals:ghi', 'z', 60_000);
    cache.invalidatePrefix('user123:list_study_calendar_entries:');
    expect(
      cache.get('user123:list_study_calendar_entries:abc'),
    ).toBeUndefined();
    expect(
      cache.get('user123:list_study_calendar_entries:def'),
    ).toBeUndefined();
    expect(cache.get('user123:get_user_goals:ghi')).toBe('z');
  });
});
