export interface InjectionCheckResult {
  isInjection: boolean;
  reason?: string;
}

/** Max chars before we treat a message as a potential token-overflow attack. */
const MAX_USER_TEXT_LENGTH = 2000;

/**
 * Patterns that strongly indicate prompt injection attempts.
 * Each entry: [pattern, reason label]
 */
const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  // Instruction override
  [
    /ignore\s+(all\s+)?(previous|prior|above|earlier|old)\s+instructions?/i,
    'instruction_override',
  ],
  [
    /disregard\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
    'instruction_override',
  ],
  [
    /forget\s+(everything|all\s+instructions?|your\s+instructions?)/i,
    'instruction_override',
  ],
  [
    /bỏ\s*qua\s+(mọi\s+)?(hướng\s*dẫn|lệnh)\s*(trước|cũ|trên)/i,
    'instruction_override',
  ],

  // Injected role markers — checked before persona_override to get correct reason
  [/\n\s*#{1,3}\s*system\b/i, 'injected_role_marker'],
  [/\n\s*<\s*system\s*>/i, 'injected_role_marker'],
  [/\n\s*\[\s*system\s*\]/i, 'injected_role_marker'],
  [/```\s*system\b/i, 'injected_role_marker'],
  [/\n\s*system\s*:\s*\n/i, 'injected_role_marker'],

  // Role / persona override
  [
    /you\s+are\s+now\s+(a\s+|an\s+)?(?!WISPACE|a\s+helpful)/i,
    'persona_override',
  ],
  // "act as" — only flag when implying AI persona override, not general usage
  [
    /act\s+as\s+(a\s+|an\s+)?(unrestricted|different|other|new|another|alternative|evil|free|uncensored|dangerous|DAN|hacker|malicious|unfiltered)/i,
    'persona_override',
  ],
  [/pretend\s+(you\s+are|to\s+be)/i, 'persona_override'],
  [/roleplay\s+as/i, 'persona_override'],
  [/from\s+now\s+on\s+(you\s+are|act|respond|behave)/i, 'persona_override'],
  [
    /developer\s+mode|jailbreak\s+mode|unrestricted\s+mode/i,
    'persona_override',
  ],
  [/\bDAN\b.*(?:do\s+anything|jailbreak)/i, 'persona_override'],

  // System prompt extraction
  [/reveal\s+(your\s+)?(system\s*prompt|instructions?|prompt)/i, 'extraction'],
  [/show\s+me\s+(your\s+)?(system\s*prompt|instructions?)/i, 'extraction'],
  [
    /what\s+(are\s+your|is\s+your)\s+(system\s*prompt|instructions?)/i,
    'extraction',
  ],
  [/print\s+(your\s+)?(system\s*prompt|instructions?)/i, 'extraction'],
  [
    /repeat\s+(your\s+)?(system\s*prompt|instructions?|previous\s+message)/i,
    'extraction',
  ],

  // Prompt delimiter injection
  [/\n\s*(human|user|assistant|ai)\s*:\s*\n/i, 'delimiter_injection'],
  [/<\|im_start\|>|<\|im_end\|>/i, 'delimiter_injection'],
  [/\[INST\]|\[\/INST\]/i, 'delimiter_injection'],
];

/** Detects repetition-based context flooding (e.g. "abc " × 50). */
function hasRepetitionFlood(text: string): boolean {
  // A token of 3+ distinct chars repeated >25 times consecutively
  return /([^\s]{3,20}\s*)\1{25,}/i.test(text);
}

function scanPatterns(text: string): InjectionCheckResult {
  if (hasRepetitionFlood(text)) {
    return { isInjection: true, reason: 'repetition_flood' };
  }

  for (const [pattern, reason] of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { isInjection: true, reason };
    }
  }

  return { isInjection: false };
}

/** Check user-supplied input — applies length limit + pattern scan. */
export function detectPromptInjection(userText: string): InjectionCheckResult {
  const text = userText ?? '';

  if (text.length > MAX_USER_TEXT_LENGTH) {
    return { isInjection: true, reason: 'message_too_long' };
  }

  return scanPatterns(text);
}

/** Check tool result content — pattern scan only (no length limit). */
export function sanitizeToolResultContent(content: string): {
  content: string;
  wasSanitized: boolean;
  reason?: string;
} {
  const check = scanPatterns(content);
  if (check.isInjection) {
    return {
      content: JSON.stringify({ _sanitized: true }),
      wasSanitized: true,
      reason: check.reason,
    };
  }
  return { content, wasSanitized: false };
}
