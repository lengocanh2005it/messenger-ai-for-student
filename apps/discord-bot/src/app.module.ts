import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IntentsBitField, Partials } from 'discord.js';
import { NecordModule } from 'necord';
import { DatabaseModule } from './infrastructure/database/database.module';
import { DiscordChatModule } from './modules/discord-chat/discord-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Own .env wins; falls back to root .env.shared for cross-bot vars
      // (WISPACE_INTERNAL_KEY, OPENAI_*, DB_*...) — see .env.shared.example.
      // Missing files are silently skipped, so this is a no-op when the
      // shared file doesn't exist (e.g. production containers).
      envFilePath: ['.env', '../../.env.shared'],
    }),
    NecordModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        token: configService.getOrThrow<string>('DISCORD_BOT_TOKEN'),
        intents: [
          IntentsBitField.Flags.Guilds,
          IntentsBitField.Flags.GuildMembers,
          IntentsBitField.Flags.DirectMessages,
          IntentsBitField.Flags.MessageContent,
        ],
        partials: [Partials.Channel],
      }),
    }),
    DatabaseModule,
    DiscordChatModule,
  ],
})
export class AppModule {}
