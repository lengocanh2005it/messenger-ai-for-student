# LLM Provider Adapter — Decouple Function Calling from OpenAI

## Status

Proposed

## Context

`packages/llm-agent` is the core agentic loop shared across Messenger and Discord bots. It handles function calling (tool definitions, tool call parsing, tool result round-trips) with LLM providers.

Currently, the entire agentic loop is tightly coupled to OpenAI:

- `LlmAgentService` instantiates `new OpenAI({ apiKey })` and calls `client.chat.completions.create()` directly
- Tool definitions use OpenAI's `ChatCompletionTool[]` type
- Response parsing hardcodes `response.choices[0].message.tool_calls` — OpenAI-specific shape
- `LlmAgentConfig` has an OpenAI-specific `apiKey` field
- Error classification utilities check OpenAI-specific `error.name` / `error.status` properties
- The `openai` npm package is a direct dependency of the core package

This means switching to any other LLM provider (Minimax, Anthropic, Google Gemini, local models) requires rewriting the agentic loop. The codebase already established a clean port/adapter pattern (`ToolExecutorPort`, `LlmExecutionPort`) but stopped short of abstracting the LLM provider itself.

ADR-0002 states: "`packages/llm-agent` is pure TypeScript with no NestJS imports. It can be used with any bot framework." This refactor strengthens that guarantee by also removing the OpenAI SDK dependency from the core loop.

## Decision

Introduce a `LlmProviderAdapter` interface that abstracts the LLM provider behind a provider-agnostic contract. The agentic loop (`LlmAgentService`) only works with provider-agnostic types; each provider implements an adapter that converts to/from its native format.

### Provider-agnostic types

```typescript
interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;    // for role='tool'
  toolCalls?: LlmToolCall[]; // for assistant with tool calls
}

interface LlmToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

interface LlmResponse {
  text?: string;
  toolCalls?: LlmToolCall[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
}
```

### Adapter interface

```typescript
interface LlmProviderAdapter {
  readonly providerName: string;
  chat(params: {
    model: string;
    messages: LlmMessage[];
    tools?: LlmToolDefinition[];
    toolChoice?: 'auto' | 'none' | 'required';
  }): Promise<LlmResponse>;
  isRetryableError(error: unknown): boolean;
  isRateLimitError(error: unknown): boolean;
}
```

### Adapter responsibilities

Each adapter handles:

1. **Tool definition conversion**: `LlmToolDefinition[]` → provider-native format (e.g. OpenAI `ChatCompletionTool[]`, Anthropic `Tool[]`)
2. **Message conversion**: `LlmMessage[]` → provider-native message format
3. **Response normalization**: provider-native response → `LlmResponse`
4. **Error classification**: `isRetryableError()` / `isRateLimitError()` using provider-specific error shapes

### OpenAI adapter (reference implementation)

- Converts `LlmToolDefinition` → `ChatCompletionTool`
- Converts `LlmMessage` → `ChatCompletionMessageParam`
- Converts `ChatCompletion` → `LlmResponse`
- Moves existing `openai-error.utils.ts` logic into adapter methods

### Agentic loop changes

- `LlmAgentService` receives `LlmProviderAdapter` via constructor (no more `apiKey`)
- `AGENT_TOOLS` type changes from `ChatCompletionTool[]` to `LlmToolDefinition[]`
- Response handling uses `LlmResponse` instead of `ChatCompletion`
- Tool result messages constructed as `LlmMessage` with `role: 'tool'`

### Config

- `LlmAgentConfig` loses `apiKey` — adapter handles auth internally
- New env var: `LLM_PROVIDER` (default: `openai`)
- Provider-specific env vars remain per-adapter (e.g. `OPENAI_API_KEY`, `MINIMAX_API_KEY`)

## Alternatives considered

| Alternative | Reason for rejection |
|-------------|---------------------|
| Keep OpenAI, add Minimax as secondary via wrapper | Still couples core to OpenAI types; wrapper adds indirection without removing dependency |
| Use LangChain/Vercel AI SDK as abstraction | Heavy dependencies; adds abstraction we don't control; already have clean port pattern that just needs completing |
| Provider-specific `LlmAgentService` subclasses | Duplication of agentic loop logic; violates DRY; harder to maintain |
| Direct `fetch` with per-provider HTTP calls | Reinvents what the OpenAI SDK already does; error handling, retries, streaming become our problem |

## Consequences

- **Positive**: Adding a new LLM provider requires only implementing `LlmProviderAdapter` — no changes to `LlmAgentService` or tool executors
- **Positive**: `packages/llm-agent` no longer depends on the `openai` npm package in its core (only the OpenAI adapter does)
- **Positive**: Stronger guarantee for ADR-0002's "framework-agnostic" claim
- **Positive**: Provider-specific error handling is encapsulated, not scattered across utils
- **Negative**: One more interface to maintain; slightly more indirection in the call chain
- **Negative**: Existing tests in `agent.service.spec.ts` need mock adapter instead of mock OpenAI response
- **Negative**: `LlmExecutionPort` retry logic needs to use adapter's `isRetryableError()` instead of the current `isOpenAiRetryableError()` import

## Scope

- **Phase 1** (this ADR): `packages/llm-agent` — core agentic loop
- **Phase 2** (follow-up): `@wispace/student-report` — independent OpenAI client for report generation
- **Phase 3** (future): Multi-provider routing, fallback chains, cost-based model selection
