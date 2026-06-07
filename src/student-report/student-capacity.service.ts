import { Injectable } from '@nestjs/common';
import { TaskScoreAverageApiService } from './task-score-average-api.service';
import { StudentCapacityInput } from './student-capacity.types';

@Injectable()
export class StudentCapacityService {
  constructor(
    private readonly taskScoreAverageApiService: TaskScoreAverageApiService,
  ) {}

  getCapacityData(userId: number): Promise<StudentCapacityInput> {
    return this.taskScoreAverageApiService.getCapacityData(userId);
  }
}
