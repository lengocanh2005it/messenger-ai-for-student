export interface LlmGroundingResult {
  suspicious: boolean;
  reason?: 'score_without_tool' | 'schedule_without_tool';
}

// Matches personal score claims in Vietnamese:
// "của bạn / bạn đang" near a decimal score, or decimal near "điểm"/"/ 10"
const PERSONAL_SCORE_RE =
  /(của bạn|bạn đang|bạn đạt|bạn có).{0,50}\d+[.,]\d+|\d+[.,]\d+.{0,30}(của bạn|điểm|\/10)/i;

// Matches "DD/MM", "DD-MM", "lúc HH:MM" — personal schedule claims
const PERSONAL_SCHEDULE_RE =
  /\b\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?\b|\blúc\s+\d{1,2}:\d{2}\b/i;

const SCORE_TOOLS = new Set(['get_user_goals', 'get_learning_progress_report']);

const SCHEDULE_TOOLS = new Set([
  'list_study_calendar_entries',
  'get_upcoming_study_sessions',
  'preview_next_study_reminder',
]);

/**
 * Checks whether the LLM response contains specific personal data claims
 * (band scores, session dates/times) without a corresponding tool having
 * been called in this turn. Returns suspicious=true if grounding is missing.
 */
export function checkLlmGrounding(
  responseText: string,
  toolsCalledThisTurn: ReadonlySet<string>,
): LlmGroundingResult {
  if (
    PERSONAL_SCORE_RE.test(responseText) &&
    !hasAny(toolsCalledThisTurn, SCORE_TOOLS)
  ) {
    return { suspicious: true, reason: 'score_without_tool' };
  }

  if (
    PERSONAL_SCHEDULE_RE.test(responseText) &&
    !hasAny(toolsCalledThisTurn, SCHEDULE_TOOLS)
  ) {
    return { suspicious: true, reason: 'schedule_without_tool' };
  }

  return { suspicious: false };
}

function hasAny(called: ReadonlySet<string>, required: Set<string>): boolean {
  for (const tool of required) {
    if (called.has(tool)) return true;
  }
  return false;
}
