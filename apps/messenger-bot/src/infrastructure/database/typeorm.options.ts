import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { LlmSafetyEventEntity } from './entities/llm-safety-event.entity';
import { MessengerChatDailyUsageEntity } from './entities/messenger-chat-daily-usage.entity';
import { MessengerChatEventEntity } from './entities/messenger-chat-event.entity';
import { LlmUsageEventEntity } from './entities/llm-usage-event.entity';
import { MessengerChatIdempotencyEntity } from './entities/messenger-chat-idempotency.entity';
import { MessengerMessageLogEntity } from './entities/messenger-message-log.entity';
import { MessengerScheduledReportClaimEntity } from './entities/messenger-scheduled-report-claim.entity';
import { MessengerWebhookDeadLetterEntity } from './entities/messenger-webhook-dead-letter.entity';
import { ReportSendJobEntity } from './entities/report-send-job.entity';
import { StudyReminderJobEntity } from './entities/study-reminder-job.entity';
import { UserMessengerMappingEntity } from './entities/user-messenger-mapping.entity';
import { UserEntity } from './entities/user.entity';

type EnvSource = ConfigService | NodeJS.ProcessEnv;

function readEnv(source: EnvSource, key: string): string | undefined {
  if (source instanceof ConfigService) {
    return source.get<string>(key);
  }

  return source[key];
}

export function getTypeOrmOptions(
  source: EnvSource,
  options?: { includeUsers?: boolean },
): DataSourceOptions {
  return {
    type: 'postgres',
    host: readEnv(source, 'DB_HOST'),
    port: Number(readEnv(source, 'DB_PORT') ?? 5432),
    username: readEnv(source, 'DB_USER'),
    password: readEnv(source, 'DB_PASSWORD'),
    database: readEnv(source, 'DB_NAME'),
    ssl:
      readEnv(source, 'DB_SSL') === 'true'
        ? { rejectUnauthorized: false }
        : false,
    entities: [
      UserMessengerMappingEntity,
      MessengerMessageLogEntity,
      MessengerWebhookDeadLetterEntity,
      MessengerScheduledReportClaimEntity,
      ReportSendJobEntity,
      MessengerChatDailyUsageEntity,
      MessengerChatEventEntity,
      LlmUsageEventEntity,
      LlmSafetyEventEntity,
      MessengerChatIdempotencyEntity,
      StudyReminderJobEntity,
      ...(options?.includeUsers ? [UserEntity] : []),
    ],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    synchronize: false,
    logging: readEnv(source, 'DB_LOGGING') === 'true',
  };
}

export function getAppTypeOrmOptions(
  config: ConfigService,
): DataSourceOptions & { migrationsRun?: boolean } {
  return {
    ...getTypeOrmOptions(config, { includeUsers: true }),
    migrationsRun: config.get<string>('DB_MIGRATIONS_RUN') === 'true',
  };
}
