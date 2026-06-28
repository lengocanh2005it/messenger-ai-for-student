import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';
import type { HistogramConfiguration, CounterConfiguration } from 'prom-client';
import {
  trace,
  context,
  SpanStatusCode,
  type Tracer,
} from '@opentelemetry/api';

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

  /** Chat quota deny events — labeled by reason (DAILY_LIMIT | BURST_LIMIT) */
  readonly quotaDenied: Counter<'reason'>;

  /** Study reminder dispatch outcomes — labeled by status (sent | cancelled | failed | retried) */
  readonly reminderDispatch: Counter<'status'>;

  /** LLM call duration at execution-service layer — covers all features */
  readonly llmExecution: Histogram<'feature' | 'status'>;

  private readonly tracer: Tracer;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.tracer = trace.getTracer('messenger-ai-for-student');

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

    this.quotaDenied = c({
      name: 'messenger_chat_quota_denied_total',
      help: 'Chat quota denied events by reason',
      labelNames: ['reason'],
    });

    this.reminderDispatch = c({
      name: 'messenger_reminder_dispatch_total',
      help: 'Study reminder dispatch outcomes by status',
      labelNames: ['status'],
    });

    this.llmExecution = h({
      name: 'messenger_llm_execution_duration_seconds',
      help: 'LLM request duration at execution-service layer, per feature',
      labelNames: ['feature', 'status'],
      buckets: LLM_CALL_BUCKETS,
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

  /** Time an async pipeline step — emits both Prometheus metric and OTel span. */
  async timeStep<T>(step: string, fn: () => Promise<T>): Promise<T> {
    const span = this.tracer.startSpan(`chat.${step}`);
    const end = this.chatStep.startTimer({ step });
    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();
        end({ status: 'ok' });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        end({ status: 'error' });
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  /** Time one OpenAI API call — emits both Prometheus metric and OTel span. */
  async timeLlmCall<T>(
    feature: string,
    model: string,
    round: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const span = this.tracer.startSpan(`llm.call.round_${round}`);
    span.setAttributes({
      'llm.feature': feature,
      'llm.model': model,
      'llm.round': round,
    });
    const end = this.llmCall.startTimer({
      feature,
      model,
      round: String(round),
    });
    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();
        end({ status: 'ok' });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        end({ status: 'error' });
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  /** Time one LLM call at execution-service layer — emits Prometheus histogram + OTel span. */
  async timeLlmExecution<T>(
    feature: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const span = this.tracer.startSpan('llm.execution');
    span.setAttribute('llm.feature', feature);
    const end = this.llmExecution.startTimer({ feature });
    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();
        end({ status: 'ok' });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        end({ status: 'error' });
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  /** Wrap a Wispace API call with an OTel child span. */
  async timeWispaceCall<T>(
    service: string,
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const span = this.tracer.startSpan(`wispace.${service}.${operation}`);
    span.setAttributes({
      'wispace.service': service,
      'wispace.operation': operation,
    });
    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }

  /** Time one tool execution — emits both Prometheus metric and OTel span. */
  async timeTool<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    const span = this.tracer.startSpan(`llm.tool.${toolName}`);
    span.setAttribute('llm.tool_name', toolName);
    const end = this.llmToolDuration.startTimer({ tool_name: toolName });
    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await fn();
        end({ status: 'ok' });
        this.llmToolCalls.inc({ tool_name: toolName, status: 'ok' });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        end({ status: 'error' });
        this.llmToolCalls.inc({ tool_name: toolName, status: 'error' });
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    });
  }
}
