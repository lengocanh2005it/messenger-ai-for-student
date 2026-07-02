import { Module } from '@nestjs/common';
import { WispaceConfigService } from './application/services/wispace-config.service';
import { WispaceGoalsService } from './application/services/wispace-goals.service';
import { WispaceCalendarService } from './application/services/wispace-calendar.service';
import { DiscordStudyCalendarCommandService } from './application/services/discord-study-calendar-command.service';

@Module({
  providers: [
    WispaceConfigService,
    WispaceGoalsService,
    WispaceCalendarService,
    DiscordStudyCalendarCommandService,
  ],
  exports: [
    WispaceGoalsService,
    WispaceCalendarService,
    DiscordStudyCalendarCommandService,
  ],
})
export class WispaceModule {}
