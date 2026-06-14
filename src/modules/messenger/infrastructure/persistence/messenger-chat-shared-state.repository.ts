import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessengerChatHistoryEntity } from '../../../../infrastructure/database/entities/messenger-chat-history.entity';
import { MessengerChatQueueBufferEntity } from '../../../../infrastructure/database/entities/messenger-chat-queue-buffer.entity';
import { MessengerChatWebhookSeenEntity } from '../../../../infrastructure/database/entities/messenger-chat-webhook-seen.entity';
import type { MessengerLinkContext } from '../../../../shared/config/poc.constants';
import type {
  AppendChatBufferInput,
  ChatHistoryMessage,
  ChatQueueBufferSnapshot,
  CompleteChatBufferInput,
} from '../../domain/entities/chat-shared-state.types';
import { MessengerChatSharedStateRepositoryPort } from '../../domain/repositories/messenger-chat-shared-state.repository.port';

interface QueueBufferRow {
  psid: string;
  user_id: number | null;
  link_context: MessengerLinkContext | null;
  texts: string[];
  pending_texts: string[];
  last_idempotency_key: string | null;
  last_pending_idempotency_key: string | null;
  processing: boolean;
  processing_started_at: Date | null;
  flush_after_at: Date | null;
}

@Injectable()
export class MessengerChatSharedStateRepository implements MessengerChatSharedStateRepositoryPort {
  constructor(
    @InjectRepository(MessengerChatQueueBufferEntity)
    private readonly queueBufferRepo: Repository<MessengerChatQueueBufferEntity>,
    @InjectRepository(MessengerChatHistoryEntity)
    private readonly chatHistoryRepo: Repository<MessengerChatHistoryEntity>,
    @InjectRepository(MessengerChatWebhookSeenEntity)
    private readonly webhookSeenRepo: Repository<MessengerChatWebhookSeenEntity>,
    private readonly configService: ConfigService,
  ) {}

  async tryMarkWebhookSeen(messageMid: string, psid: string): Promise<boolean> {
    const rows: Array<{ message_mid: string }> =
      await this.webhookSeenRepo.manager.query(
        `
          INSERT INTO messenger_chat_webhook_seen (message_mid, psid)
          VALUES ($1, $2)
          ON CONFLICT (message_mid) DO NOTHING
          RETURNING message_mid
        `,
        [messageMid, psid],
      );

    return rows.length > 0;
  }

  async purgeStaleWebhookSeen(retentionMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionMs);
    const result = await this.webhookSeenRepo
      .createQueryBuilder()
      .delete()
      .where('seen_at < :cutoff', { cutoff })
      .execute();

    return result.affected ?? 0;
  }

  async appendChatBuffer(input: AppendChatBufferInput): Promise<void> {
    await this.queueBufferRepo.manager.transaction(async (manager) => {
      const rows: QueueBufferRow[] = await manager.query(
        `
          SELECT
            psid,
            user_id,
            link_context,
            texts,
            pending_texts,
            last_idempotency_key,
            last_pending_idempotency_key,
            processing,
            processing_started_at,
            flush_after_at
          FROM messenger_chat_queue_buffer
          WHERE psid = $1
          FOR UPDATE
        `,
        [input.psid],
      );

      const flushAfter = new Date(Date.now() + input.debounceMs);
      const linkContextJson = input.linkContext
        ? JSON.stringify(input.linkContext)
        : null;

      if (rows.length === 0) {
        await manager.query(
          `
            INSERT INTO messenger_chat_queue_buffer (
              psid,
              user_id,
              link_context,
              texts,
              pending_texts,
              last_idempotency_key,
              flush_after_at,
              updated_at
            )
            VALUES ($1, $2, $3::jsonb, jsonb_build_array($4::text), '[]'::jsonb, $5, $6, now())
          `,
          [
            input.psid,
            input.userId ?? null,
            linkContextJson,
            input.userText,
            input.idempotencyKey ?? null,
            flushAfter,
          ],
        );
        return;
      }

      const row = rows[0];
      if (row.processing) {
        await manager.query(
          `
            UPDATE messenger_chat_queue_buffer
            SET
              user_id = COALESCE($2, user_id),
              link_context = COALESCE($3::jsonb, link_context),
              pending_texts = pending_texts || jsonb_build_array($4::text),
              last_pending_idempotency_key = COALESCE($5, last_pending_idempotency_key),
              updated_at = now()
            WHERE psid = $1
          `,
          [
            input.psid,
            input.userId ?? null,
            linkContextJson,
            input.userText,
            input.idempotencyKey ?? null,
          ],
        );
        return;
      }

      await manager.query(
        `
          UPDATE messenger_chat_queue_buffer
          SET
            user_id = COALESCE($2, user_id),
            link_context = COALESCE($3::jsonb, link_context),
            texts = texts || jsonb_build_array($4::text),
            last_idempotency_key = COALESCE($5, last_idempotency_key),
            flush_after_at = $6,
            updated_at = now()
          WHERE psid = $1
        `,
        [
          input.psid,
          input.userId ?? null,
          linkContextJson,
          input.userText,
          input.idempotencyKey ?? null,
          flushAfter,
        ],
      );
    });
  }

  async claimReadyBuffer(
    psid: string,
    debounceMs: number,
    processingStuckMs: number,
  ): Promise<ChatQueueBufferSnapshot | null> {
    return this.queueBufferRepo.manager.transaction(async (manager) => {
      const rows: QueueBufferRow[] = await manager.query(
        `
          SELECT
            psid,
            user_id,
            link_context,
            texts,
            pending_texts,
            last_idempotency_key,
            last_pending_idempotency_key,
            processing,
            processing_started_at,
            flush_after_at
          FROM messenger_chat_queue_buffer
          WHERE psid = $1
          FOR UPDATE
        `,
        [psid],
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const texts = this.parseTextArray(row.texts);
      if (texts.length === 0) {
        return null;
      }

      if (row.processing) {
        const startedAt = row.processing_started_at
          ? new Date(row.processing_started_at).getTime()
          : 0;
        const stuck =
          startedAt > 0 && Date.now() - startedAt >= processingStuckMs;

        if (!stuck) {
          return null;
        }

        await manager.query(
          `
            UPDATE messenger_chat_queue_buffer
            SET
              processing = false,
              processing_started_at = NULL,
              updated_at = now()
            WHERE psid = $1
          `,
          [psid],
        );
      }

      const flushAfter = row.flush_after_at
        ? new Date(row.flush_after_at).getTime()
        : null;
      if (flushAfter !== null && flushAfter > Date.now()) {
        return null;
      }

      await manager.query(
        `
          UPDATE messenger_chat_queue_buffer
          SET
            processing = true,
            processing_started_at = now(),
            texts = '[]'::jsonb,
            last_idempotency_key = NULL,
            updated_at = now()
          WHERE psid = $1
        `,
        [psid],
      );

      return {
        psid,
        texts,
        lastIdempotencyKey: row.last_idempotency_key ?? undefined,
        userId: row.user_id ?? undefined,
        linkContext: row.link_context ?? undefined,
      };
    });
  }

  async completeChatBuffer(input: CompleteChatBufferInput): Promise<boolean> {
    return this.queueBufferRepo.manager.transaction(async (manager) => {
      const rows: QueueBufferRow[] = await manager.query(
        `
          SELECT
            pending_texts,
            last_pending_idempotency_key
          FROM messenger_chat_queue_buffer
          WHERE psid = $1
          FOR UPDATE
        `,
        [input.psid],
      );

      if (rows.length === 0) {
        return false;
      }

      const pendingTexts = this.parseTextArray(rows[0].pending_texts);
      const flushAfter =
        pendingTexts.length > 0
          ? new Date(Date.now() + input.debounceMs)
          : null;

      await manager.query(
        `
          UPDATE messenger_chat_queue_buffer
          SET
            processing = false,
            processing_started_at = NULL,
            texts = $2::jsonb,
            pending_texts = '[]'::jsonb,
            last_idempotency_key = $3,
            last_pending_idempotency_key = NULL,
            flush_after_at = $4,
            updated_at = now()
          WHERE psid = $1
        `,
        [
          input.psid,
          JSON.stringify(pendingTexts),
          rows[0].last_pending_idempotency_key,
          flushAfter,
        ],
      );

      return pendingTexts.length > 0;
    });
  }

  async listPsidsReadyForFlush(
    limit: number,
    processingStuckMs: number,
  ): Promise<string[]> {
    const rows: Array<{ psid: string }> =
      await this.queueBufferRepo.manager.query(
        `
          SELECT psid
          FROM messenger_chat_queue_buffer
          WHERE jsonb_array_length(texts) > 0
            AND (
              (
                processing = false
                AND flush_after_at IS NOT NULL
                AND flush_after_at <= NOW()
              )
              OR (
                processing = true
                AND processing_started_at IS NOT NULL
                AND processing_started_at < NOW() - ($2::bigint * INTERVAL '1 millisecond')
              )
            )
          ORDER BY flush_after_at ASC NULLS LAST, updated_at ASC
          LIMIT $1
        `,
        [limit, processingStuckMs],
      );

    return rows.map((row) => row.psid);
  }

  async getChatHistory(
    psid: string,
    ttlMs: number,
  ): Promise<ChatHistoryMessage[]> {
    const row = await this.chatHistoryRepo.findOne({
      where: { psid },
      select: { messages: true, updatedAt: true },
    });

    if (!row) {
      return [];
    }

    if (Date.now() - row.updatedAt.getTime() > ttlMs) {
      await this.chatHistoryRepo.delete({ psid });
      return [];
    }

    return row.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));
  }

  async appendChatHistoryTurn(
    psid: string,
    userText: string,
    assistantText: string,
    maxMessages: number,
  ): Promise<void> {
    const user = userText.trim();
    const assistant = assistantText.trim();
    if (!user || !assistant) {
      return;
    }

    const ttlMs = this.readHistoryTtlMs();

    await this.chatHistoryRepo.manager.transaction(async (manager) => {
      // Serialize concurrent writes for the same psid (e.g., stuck-recovery
      // triggering two flushes simultaneously). Transaction-scoped lock —
      // auto-released on commit/rollback.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `chat_history:${psid}`,
      ]);

      const row = await manager.findOne(MessengerChatHistoryEntity, {
        where: { psid },
        select: { messages: true, updatedAt: true },
      });

      let existing: ChatHistoryMessage[] = [];
      if (row) {
        if (Date.now() - row.updatedAt.getTime() > ttlMs) {
          await manager.delete(MessengerChatHistoryEntity, { psid });
        } else {
          existing = row.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));
        }
      }

      const messages = [
        ...existing,
        { role: 'user' as const, content: user },
        { role: 'assistant' as const, content: assistant },
      ].slice(-maxMessages);

      await manager.query(
        `
          INSERT INTO messenger_chat_history (psid, messages, updated_at)
          VALUES ($1, $2::jsonb, now())
          ON CONFLICT (psid)
          DO UPDATE SET
            messages = EXCLUDED.messages,
            updated_at = now()
        `,
        [psid, JSON.stringify(messages)],
      );
    });
  }

  async clearChatHistory(psid: string): Promise<void> {
    await this.chatHistoryRepo.delete({ psid });
  }

  private parseTextArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  private readHistoryTtlMs(): number {
    const raw = this.configService.get<string>('CHAT_HISTORY_TTL_MS')?.trim();
    if (!raw) {
      return 30 * 60 * 1000;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return 30 * 60 * 1000;
    }

    return Math.floor(value);
  }
}
