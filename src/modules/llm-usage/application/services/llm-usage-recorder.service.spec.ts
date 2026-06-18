import { LlmUsageRecorderService } from './llm-usage-recorder.service';
import type { LlmUsageBullQueueService } from '../../infrastructure/queue/llm-usage-bull-queue.service';
import { LlmUsageConfigService } from './llm-usage-config.service';

describe('LlmUsageRecorderService', () => {
  it('enqueues usage via BullMQ without blocking the caller', () => {
    const enqueue = jest.fn();
    const bullQueue = { enqueue } as unknown as LlmUsageBullQueueService;
    const configService = {
      isEnabled: () => true,
      todayUsageDate: () => '2026-06-18',
      estimateCostUsdForModel: () => '0.001500',
    } as LlmUsageConfigService;

    const service = new LlmUsageRecorderService(configService, bullQueue);
    service.recordFromCompletion({
      feature: 'FREE_FORM_CHAT',
      psid: 'psid-1',
      model: 'gpt-5.4',
      response: {
        id: 'resp-1',
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      },
      correlationId: 'mid-1',
      toolRound: 0,
    });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'FREE_FORM_CHAT',
        psid: 'psid-1',
        usageDate: '2026-06-18',
        totalTokens: 3,
        openaiResponseId: 'resp-1',
      }),
    );
  });

  it('skips enqueue when LLM usage tracking is disabled', () => {
    const enqueue = jest.fn();
    const bullQueue = { enqueue } as unknown as LlmUsageBullQueueService;
    const configService = {
      isEnabled: () => false,
      todayUsageDate: () => '2026-06-18',
    } as LlmUsageConfigService;

    const service = new LlmUsageRecorderService(configService, bullQueue);
    service.recordUsage({
      feature: 'FREE_FORM_CHAT',
      model: 'gpt-5.4',
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    });

    expect(enqueue).not.toHaveBeenCalled();
  });
});
