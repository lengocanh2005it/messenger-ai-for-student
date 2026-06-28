import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';
import type { HistogramConfiguration, CounterConfiguration } from 'prom-client';

const CHAT_STEP_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30];
const LLM_CALL_BUCKETS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60];
const TOOL_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20];

@Injectable()
export class MetricsService implements OnModuleDestroy {
  readonly registry = new Registry();

  /** Per-step pipeline durations: rate_limit_reserve, history_load, llm_agent,
   *  history_append, meta_send, chat_total */
  readonly chatStep: Histogram<'step' | 'status'>;

  /** Raw OpenAI API call duration — labeled by feature, model, round */
  readonly llmCall: Histogram<'feature' | 'model' | 'round' | 'status'>;

  /** Per-tool execution duration — labeled by tool_name */
  readonly llmToolDuration: Histogram<'tool_name' | 'status'>;

  /** Total tool invocations counter */
  readonly llmToolCalls: Counter<'tool_name' | 'status'>;

  /** Agent round outcome counter — direct_reply | tool_call | exhausted | error */
  readonly llmRoundOutcome: Counter<'feature' | 'outcome'>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    const h = <L extends string>(opts: HistogramConfiguration<L>) =>
      new Histogram<L>({ ...opts, registers: [this.registry] });

    const c = <L extends string>(opts: CounterConfiguration<L>) =>
      new Counter<L>({ ...opts, registers: [this.registry] });

    this.chatStep = h({
      name: 'messenger_chat_step_duration_seconds',
      help: 'Duration of each step in the Messenger chat pipeline',
      labelNames: ['step', 'status'],
      buckets: CHAT_STEP_BUCKETS,
    });

    this.llmCall = h({
      name: 'messenger_llm_call_duration_seconds',
      help: 'OpenAI API call duration per feature, model, and tool round',
      labelNames: ['feature', 'model', 'round', 'status'],
      buckets: LLM_CALL_BUCKETS,
    });

    this.llmToolDuration = h({
      name: 'messenger_llm_tool_duration_seconds',
      help: 'Execution duration of each LLM tool call',
      labelNames: ['tool_name', 'status'],
      buckets: TOOL_BUCKETS,
    });

    this.llmToolCalls = c({
      name: 'messenger_llm_tool_calls_total',
      help: 'Total LLM tool invocations',
      labelNames: ['tool_name', 'status'],
    });

    this.llmRoundOutcome = c({
      name: 'messenger_llm_round_outcome_total',
      help: 'Agent round outcome: direct_reply, tool_call, exhausted, error',
      labelNames: ['feature', 'outcome'],
    });
  }

  onModuleDestroy(): void {
    this.registry.clear();
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }

  /** Time an async pipeline step. */
  async timeStep<T>(step: string, fn: () => Promise<T>): Promise<T> {
    const end = this.chatStep.startTimer({ step });
    try {
      const result = await fn();
      end({ status: 'ok' });
      return result;
    } catch (err) {
      end({ status: 'error' });
      throw err;
    }
  }

  /** Time one OpenAI API call (single round). */
  async timeLlmCall<T>(
    feature: string,
    model: string,
    round: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const end = this.llmCall.startTimer({
      feature,
      model,
      round: String(round),
    });
    try {
      const result = await fn();
      end({ status: 'ok' });
      return result;
    } catch (err) {
      end({ status: 'error' });
      throw err;
    }
  }

  /** Time one tool execution and increment the call counter. */
  async timeTool<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    const end = this.llmToolDuration.startTimer({ tool_name: toolName });
    try {
      const result = await fn();
      end({ status: 'ok' });
      this.llmToolCalls.inc({ tool_name: toolName, status: 'ok' });
      return result;
    } catch (err) {
      end({ status: 'error' });
      this.llmToolCalls.inc({ tool_name: toolName, status: 'error' });
      throw err;
    }
  }
}
