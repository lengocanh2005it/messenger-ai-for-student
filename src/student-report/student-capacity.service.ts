import { Injectable } from '@nestjs/common';
import { TaskScoreAverageApiService } from './task-score-average-api.service';
import { StudentCapacityInput } from './student-capacity.types';

@Injectable()
export class StudentCapacityService {
  constructor(
    private readonly taskScoreAverageApiService: TaskScoreAverageApiService,
  ) {}

  getCapacityData(psid: string): Promise<StudentCapacityInput> {
    return this.taskScoreAverageApiService.getCapacityData(psid);
  }
}
