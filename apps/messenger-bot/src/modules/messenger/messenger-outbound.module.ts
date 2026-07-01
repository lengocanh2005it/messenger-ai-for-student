import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MessengerMessageLogEntity,
  MessengerScheduledReportClaimEntity,
  UserMessengerMappingEntity,
} from '../../infrastructure/database/entities';
import { MESSAGE_SENDER } from './application/ports/message-sender.port';
import { MessengerOutboundService } from './application/services/messenger-outbound.service';
import { MESSENGER_REPOSITORY } from './domain/repositories/messenger.repository.port';
import { MESSENGER_MAPPING_READER } from '../study-reminder/application/ports/messenger-mapping.port';
import { MessengerRepository } from './infrastructure/persistence/messenger.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserMessengerMappingEntity,
      MessengerMessageLogEntity,
      MessengerScheduledReportClaimEntity,
    ]),
  ],
  providers: [
    MessengerRepository,
    MessengerOutboundService,
    {
      provide: MESSENGER_REPOSITORY,
      useExisting: MessengerRepository,
    },
    {
      provide: MESSENGER_MAPPING_READER,
      useExisting: MessengerRepository,
    },
    {
      provide: MESSAGE_SENDER,
      useExisting: MessengerOutboundService,
    },
  ],
  exports: [
    MessengerOutboundService,
    MessengerRepository,
    MESSENGER_REPOSITORY,
    MESSENGER_MAPPING_READER,
    MESSAGE_SENDER,
  ],
})
export class MessengerOutboundModule {}
