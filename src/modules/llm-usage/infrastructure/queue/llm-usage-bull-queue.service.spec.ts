import type { LlmUsageRepositoryPort } from '../../domain/repositories/llm-usage.repository.port';
import type { RedisConfigService } from '../../../../infrastructure/redis/application/services/redis-config.service';
import type { LlmUsageConfigService } from '../../application/services/llm-usage-config.service';
import { LlmUsageBullQueueService } from './llm-usage-bull-queue.service';

describe('LlmUsageBullQueueService', () => {
  it('uses inline fallback when BullMQ is disabled', async () => {
    const insertUsage = jest.fn(() => Promise.resolve());
    const repository: LlmUsageRepositoryPort = {
      insertUsage,
      deleteOlderThan: jest.fn(),
    };
    const redisConfig = { isEnabled: () => false } as RedisConfigService;
    const llmConfig = {
      isBullMqEnabled: () => true,
      getBullMqAttempts: () => 3,
      getBullMqBackoffMs: () => 2000,
    } as LlmUsageConfigService;

    const service = new LlmUsageBullQueueService(
      redisConfig,
      llmConfig,
      repository,
    );
    service.onModuleInit();

    service.enqueue({
      usageDate: '2026-06-18',
      feature: 'FREE_FORM_CHAT',
      psid: 'psid-1',
      model: 'gpt-5.4',
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    });

    expect(insertUsage).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(insertUsage).toHaveBeenCalled();
  });
});
