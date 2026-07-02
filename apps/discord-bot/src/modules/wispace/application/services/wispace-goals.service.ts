import { Injectable, Logger } from '@nestjs/common';
import {
  TaskScoreAverageApiClient,
  UserGoalsApiClient,
  type TaskScoreAverageRecord,
  type UserGoalsRecord,
} from '@wispace/wispace-client';
import { WispaceConfigService } from './wispace-config.service';

const ID_HEADER = 'x-discordid' as const;

@Injectable()
export class WispaceGoalsService {
  private readonly logger = new Logger(WispaceGoalsService.name);
  private goalsClient?: UserGoalsApiClient;
  private taskScoreClient?: TaskScoreAverageApiClient;

  constructor(private readonly configService: WispaceConfigService) {}

  getUserGoals(discordUserId: string): Promise<UserGoalsRecord> {
    return this.getGoalsClient().getUserGoals(ID_HEADER, discordUserId);
  }

  getTaskScoreAverages(
    discordUserId: string,
  ): Promise<TaskScoreAverageRecord[]> {
    return this.getTaskScoreClient().getTaskScoreAverages(
      ID_HEADER,
      discordUserId,
    );
  }

  private getGoalsClient(): UserGoalsApiClient {
    if (!this.goalsClient) {
      this.goalsClient = new UserGoalsApiClient(
        this.configService.buildGoalsClientConfig(),
        { warn: (m) => this.logger.warn(m), log: (m) => this.logger.log(m) },
      );
    }

    return this.goalsClient;
  }

  private getTaskScoreClient(): TaskScoreAverageApiClient {
    if (!this.taskScoreClient) {
      this.taskScoreClient = new TaskScoreAverageApiClient(
        this.configService.buildTaskScoreClientConfig(),
        { warn: (m) => this.logger.warn(m), log: (m) => this.logger.log(m) },
      );
    }

    return this.taskScoreClient;
  }
}
