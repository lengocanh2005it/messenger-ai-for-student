import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LlmUsageEventEntity } from '@wispace/chat-metering';
import { LlmUsageRepository } from './llm-usage.repository';

describe('LlmUsageRepository', () => {
  it('inserts usage row via raw SQL', async () => {
    const query = jest.fn(() => Promise.resolve([]));
    const moduleRef = await Test.createTestingModule({
      providers: [
        LlmUsageRepository,
        {
          provide: getRepositoryToken(LlmUsageEventEntity),
          useValue: {
            manager: { query },
          },
        },
      ],
    }).compile();

    const repository = moduleRef.get(LlmUsageRepository);
    await repository.insertUsage({
      usageDate: '2026-06-18',
      feature: 'FREE_FORM_CHAT',
      psid: 'psid-1',
      model: 'gpt-5.4',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      correlationId: 'mid-1',
      toolRound: 0,
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO llm_usage_events'),
      expect.arrayContaining(['2026-06-18', 'FREE_FORM_CHAT', 'psid-1']),
    );
  });
});
