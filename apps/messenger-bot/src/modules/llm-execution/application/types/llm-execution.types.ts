export type LlmExecutionFeature =
  | 'FREE_FORM_CHAT'
  | 'STUDENT_REPORT'
  | 'STUDY_REMINDER';

export interface LlmExecutionContext {
  feature: LlmExecutionFeature;
  correlationId?: string;
}
