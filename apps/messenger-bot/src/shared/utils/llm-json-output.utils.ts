import { sanitizeMessengerText } from './messenger-text.utils';

export function parseJsonObject(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LLM JSON output must be an object');
  }

  return parsed as Record<string, unknown>;
}

export function readRequiredStringField(
  value: Record<string, unknown>,
  key: string,
  options?: { maxChars?: number },
): string {
  const raw = value[key];
  if (typeof raw !== 'string') {
    throw new Error(`LLM JSON output missing string field: ${key}`);
  }

  const text = sanitizeMessengerText(raw).replace(/\s+/g, ' ').trim();
  if (!text) {
    throw new Error(`LLM JSON output has empty string field: ${key}`);
  }

  const maxChars = options?.maxChars ?? 600;
  return text.length > maxChars ? `${text.slice(0, maxChars).trim()}...` : text;
}

export function readRequiredStringArrayField(
  value: Record<string, unknown>,
  key: string,
  options?: { minItems?: number; maxItems?: number; maxCharsPerItem?: number },
): string[] {
  const raw = value[key];
  if (!Array.isArray(raw)) {
    throw new Error(`LLM JSON output missing string array field: ${key}`);
  }

  const maxItems = options?.maxItems ?? 8;
  const items = raw
    .slice(0, maxItems)
    .map((entry) =>
      typeof entry === 'string'
        ? sanitizeMessengerText(entry).replace(/\s+/g, ' ').trim()
        : '',
    )
    .filter(Boolean)
    .map((entry) => {
      const maxChars = options?.maxCharsPerItem ?? 180;
      return entry.length > maxChars
        ? `${entry.slice(0, maxChars).trim()}...`
        : entry;
    });

  if (items.length < (options?.minItems ?? 1)) {
    throw new Error(`LLM JSON output has too few items in field: ${key}`);
  }

  return items;
}
