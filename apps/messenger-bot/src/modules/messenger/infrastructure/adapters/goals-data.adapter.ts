import { Injectable } from '@nestjs/common';
import type { GoalsDataPort } from '../../domain/ports/goals-data.port';
import { UserGoalsApiService } from '../../../student-report/infrastructure/wispace/user-goals-api.service';

@Injectable()
export class GoalsDataAdapter implements GoalsDataPort {
  constructor(private readonly userGoalsApi: UserGoalsApiService) {}

  getUserGoals(psid: string) {
    return this.userGoalsApi.getUserGoals(psid);
  }
}
