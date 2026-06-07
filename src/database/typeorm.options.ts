import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { MessengerMessageLogEntity } from './entities/messenger-message-log.entity';
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
