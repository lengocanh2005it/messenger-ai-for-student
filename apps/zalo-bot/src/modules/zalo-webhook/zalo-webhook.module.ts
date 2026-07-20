import { Module } from '@nestjs/common';
import { ZaloWebhookController } from './presentation/controllers/zalo-webhook.controller';

@Module({
  controllers: [ZaloWebhookController],
})
export class ZaloWebhookModule {}
