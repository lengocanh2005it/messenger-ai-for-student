import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: process.env.DISCORD_OAUTH_FRONTEND_CALLBACK_URL
      ? new URL(process.env.DISCORD_OAUTH_FRONTEND_CALLBACK_URL).origin
      : 'http://localhost:4321',
  });
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
