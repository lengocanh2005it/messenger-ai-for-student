/**
 * Stable PostgreSQL session-level advisory lock IDs.
 * Never reuse, renumber, or change existing values.
 */
export const ADVISORY_LOCK = {
  /** R4: daily report cron batch — managed by ReportCronLockService */
  REPORT_CRON_DAILY: 884_200_801,

  /** Full sync: Wispace UserCalendar → study_reminder_jobs upsert. */
  STUDY_REMINDER_SYNC: 884_200_901,

  /** Delete terminal/sent jobs (cleanup cron 03:00). */
  STUDY_REMINDER_CLEANUP: 884_200_902,

  /** Evening rollover: purge sent jobs + full sync. */
  STUDY_REMINDER_ROLLOVER: 884_200_903,

  /** Delete stale rows from messenger_chat_webhook_seen. */
  MESSENGER_WEBHOOK_CLEANUP: 884_200_904,

  /** Auto-retry cron for messenger_webhook_dead_letters. */
  MESSENGER_WEBHOOK_DEAD_LETTER_RETRY: 884_200_905,
} as const;
