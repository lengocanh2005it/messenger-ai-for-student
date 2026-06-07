import { Injectable, Logger } from '@nestjs/common';
import { StudentCapacityInput } from './student-capacity.types';
import { StudentCapacityRepository } from './student-capacity.repository';

@Injectable()
export class StudentCapacityService {
  private readonly logger = new Logger(StudentCapacityService.name);

  constructor(
    private readonly studentCapacityRepository: StudentCapacityRepository,
  ) {}

  async getCapacityData(userId: number): Promise<StudentCapacityInput> {
    try {
      return await this.studentCapacityRepository.getCapacityData(userId);
    } catch (error) {
      this.logger.warn(
        `Falling back to TypeORM user_profiles lookup for user_id=${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      const fallback =
        await this.studentCapacityRepository.getCapacityFromUserProfile(
          userId,
        );

      if (!fallback) {
        throw new Error(`No user_profiles row for user_id=${userId}`);
      }

      return fallback;
    }
  }
}
