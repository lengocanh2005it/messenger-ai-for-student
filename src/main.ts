import './tracing'; // MUST be first — initialises OTel SDK before any module loads
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const bodyLimit = process.env.HTTP_JSON_BODY_LIMIT?.trim() || '256kb';
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
