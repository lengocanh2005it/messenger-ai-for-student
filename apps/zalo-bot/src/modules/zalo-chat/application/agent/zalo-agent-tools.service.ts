import { Injectable } from '@nestjs/common';
import { isAgentToolName } from '@wispace/llm-agent';
import type { ZaloAgentToolContext } from '../../domain/entities/zalo-chat.types';

const NOT_LINKED_MESSAGE =
  'Bạn chưa liên kết tài khoản WISPACE với Zalo. Vào WISPACE và chọn "Kết nối Zalo" để lấy link liên kết tài khoản nhé.';

const NOT_BUILT_YET_MESSAGE =
  'Tính năng này đang được phát triển cho Zalo — bạn dùng WISPACE qua Messenger/Discord cho việc này nhé.';

/**
 * MVP stub — implements ToolExecutorPort<ZaloAgentToolContext> from
 * @wispace/llm-agent but every AGENT_TOOLS entry is unavailable, whether or
 * not the account is linked. Real tool wiring (get_user_goals, calendar,
 * reschedule...) is future work — see spec §11.1.
 */
@Injectable()
export class ZaloAgentToolsService {
  execute(
    toolName: string,
    _argsJson: string,
    ctx: ZaloAgentToolContext,
  ): Promise<unknown> {
    if (!isAgentToolName(toolName)) {
      return Promise.resolve({ error: `Unknown tool: ${toolName}` });
    }

    if (!ctx.userId) {
      return Promise.resolve({ available: false, message: NOT_LINKED_MESSAGE });
    }

    return Promise.resolve({
      available: false,
      message: NOT_BUILT_YET_MESSAGE,
    });
  }
}
