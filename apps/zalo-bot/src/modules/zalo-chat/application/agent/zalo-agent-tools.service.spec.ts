import { ZaloAgentToolsService } from './zalo-agent-tools.service';
import type { ZaloAgentToolContext } from '../../domain/entities/zalo-chat.types';

describe('ZaloAgentToolsService', () => {
  const service = new ZaloAgentToolsService();

  it('returns available:false with a link-account message when userId is not linked', async () => {
    const ctx: ZaloAgentToolContext = { zaloUserId: 'zalo-1' };
    const result = (await service.execute('get_user_goals', '{}', ctx)) as {
      available: boolean;
      message: string;
    };
    expect(result.available).toBe(false);
    expect(result.message).toContain('liên kết');
  });

  it('returns available:false with a not-yet-built message when userId is linked', async () => {
    const ctx: ZaloAgentToolContext = { zaloUserId: 'zalo-1', userId: 42 };
    const result = (await service.execute('get_user_goals', '{}', ctx)) as {
      available: boolean;
      message: string;
    };
    expect(result.available).toBe(false);
    expect(result.message).toContain('phát triển');
  });

  it('returns an error object for an unknown tool name', async () => {
    const ctx: ZaloAgentToolContext = { zaloUserId: 'zalo-1' };
    const result = (await service.execute('not_a_real_tool', '{}', ctx)) as {
      error: string;
    };
    expect(result.error).toContain('Unknown tool');
  });
});
