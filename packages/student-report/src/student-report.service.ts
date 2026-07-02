import OpenAI from 'openai';
import type {
  LlmExecutionPort,
  LlmUsageRecorderPort,
} from '@wispace/llm-agent';
import type { CapacityDataPort } from './ports';
import {
  StudentReportNoScoreDataError,
  StudentReportRetryableError,
  type RetryableApiError,
} from './errors';
import {
  buildStudentReportApiUnavailableMessage,
  buildStudentReportNoScoreDataMessage,
} from './messages';
import {
  buildFallbackReport,
  formatReport,
  parseReportOutput,
} from './report-formatter';
import type { StudentCapacityInput, StudentCapacityReport } from './types';

const DEFAULT_MODEL = 'gpt-5.4';
const FEATURE = 'STUDENT_REPORT';

export interface StudentReportConfig {
  apiKey?: string;
  model?: string;
  systemPrompt: string;
  /** Strips platform-unsupported formatting (e.g. Markdown) from LLM output. */
  sanitizeText?: (raw: string) => string;
}

export interface StudentReportPorts {
  llmExecution: LlmExecutionPort;
  usageRecorder: LlmUsageRecorderPort;
  capacityData: CapacityDataPort;
  logger?: {
    log: (message: string) => void;
    warn: (message: string) => void;
  };
}

function isRetryableApiError(error: unknown): error is RetryableApiError {
  return (
    error instanceof Error &&
    typeof (error as RetryableApiError).statusCode === 'number' &&
    typeof (error as RetryableApiError).isRetryable === 'function'
  );
}

const NOOP_LOGGER = { log: () => undefined, warn: () => undefined };

/**
 * Framework-agnostic student report generation (capacity fetch → LLM call →
 * fallback → format), shared across all WISPACE bot platforms. Wispace API
 * access, LLM execution/usage recording, and prompt loading are ports —
 * implemented per app.
 */
export class StudentReportCore {
  private openai: OpenAI | null = null;

  constructor(
    private readonly config: StudentReportConfig,
    private readonly ports: StudentReportPorts,
  ) {}

  async generateReport(
    externalUserId: string,
    options?: { correlationId?: string },
  ): Promise<string> {
    const logger = this.ports.logger ?? NOOP_LOGGER;
    const correlationId = options?.correlationId ?? externalUserId;

    try {
      const input =
        await this.ports.capacityData.getCapacityData(externalUserId);
      const report = await this.generateAiReport(
        externalUserId,
        input,
        correlationId,
      );
      return formatReport(report);
    } catch (error) {
      if (error instanceof StudentReportNoScoreDataError) {
        logger.log(
          `No score data for report externalUserId=${externalUserId}; sending guidance message`,
        );
        return buildStudentReportNoScoreDataMessage();
      }

      if (isRetryableApiError(error)) {
        if (error.isRetryable()) {
          logger.warn(
            `Retryable API error for report externalUserId=${externalUserId} status=${error.statusCode} endpoint=${error.endpoint}`,
          );
          throw new StudentReportRetryableError(externalUserId, error);
        }

        logger.warn(
          `API unavailable for report externalUserId=${externalUserId} status=${error.statusCode} endpoint=${error.endpoint}`,
        );
        return buildStudentReportApiUnavailableMessage();
      }

      throw error;
    }
  }

  private async generateAiReport(
    externalUserId: string,
    input: StudentCapacityInput,
    correlationId: string,
  ): Promise<StudentCapacityReport> {
    const logger = this.ports.logger ?? NOOP_LOGGER;

    if (!this.config.apiKey) {
      logger.warn('OPENAI_API_KEY missing, using fallback report content');
      return buildFallbackReport(input);
    }

    const model = this.config.model ?? DEFAULT_MODEL;
    const client = this.getOpenAiClient(this.config.apiKey);

    const response = await this.ports.llmExecution.run(
      () =>
        client.chat.completions.create({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: this.config.systemPrompt },
            { role: 'user', content: JSON.stringify(input) },
          ],
        }),
      { feature: FEATURE, correlationId },
    );

    this.ports.usageRecorder.recordFromCompletion({
      feature: FEATURE,
      externalUserId,
      model,
      response,
      correlationId,
      toolRound: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty content');
    }

    try {
      return parseReportOutput(content, this.config.sanitizeText);
    } catch (error) {
      logger.warn(
        `Invalid student report LLM output externalUserId=${externalUserId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return buildFallbackReport(input);
    }
  }

  private getOpenAiClient(apiKey: string): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey });
    }
    return this.openai;
  }
}
