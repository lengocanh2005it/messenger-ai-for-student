/**
 * Bidirectional mapper between provider-agnostic types and OpenAI-native types.
 * Kept as pure functions for easy unit testing without mocking the SDK.
 */
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import type {
  LlmMessage,
  LlmToolDefinition,
  LlmToolCall,
  LlmUsage,
} from '../types';

// ---------------------------------------------------------------------------
// Neutral → OpenAI
// ---------------------------------------------------------------------------

export function toOpenAiTools(
  tools: LlmToolDefinition[],
): ChatCompletionTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toOpenAiMessages(
  messages: LlmMessage[],
): ChatCompletionMessageParam[] {
  return messages.map((msg) => {
    switch (msg.role) {
      case 'system':
      case 'user':
        return { role: msg.role, content: msg.content ?? '' };

      case 'assistant':
        if (msg.toolCalls?.length) {
          return {
            role: 'assistant',
            content: msg.content ?? null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          };
        }
        return { role: 'assistant', content: msg.content ?? '' };

      case 'tool':
        return {
          role: 'tool',
          tool_call_id: msg.toolCallId ?? '',
          content: msg.content ?? '',
        };

      default:
        return { role: 'user', content: '' };
    }
  });
}

// ---------------------------------------------------------------------------
// OpenAI → Neutral
// ---------------------------------------------------------------------------

export function fromOpenAiToolCalls(
  toolCalls: NonNullable<ChatCompletion['choices'][0]['message']['tool_calls']>,
): LlmToolCall[] {
  return toolCalls
    .filter((tc) => tc.type === 'function')
    .map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
}

export function fromOpenAiUsage(
  usage: ChatCompletion['usage'] | null | undefined,
): LlmUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens,
  };
}
