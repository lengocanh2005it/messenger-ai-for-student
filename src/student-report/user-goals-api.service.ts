import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserGoalsRecord } from './user-goals.types';

@Injectable()
export class UserGoalsApiService {
  private readonly logger = new Logger(UserGoalsApiService.name);

  constructor(private readonly configService: ConfigService) {}

  async getUserGoals(): Promise<UserGoalsRecord> {
    const url =
      this.configService.get<string>('WISPACE_API_USER_GOALS_URL') ??
      'https://backend.aihubproduction.com/api/User/goals';
    const accessToken = this.configService.get<string>(
      'WISPACE_API_ACCESS_TOKEN',
    );

    if (!accessToken) {
      throw new InternalServerErrorException(
        'WISPACE_API_ACCESS_TOKEN is missing',
      );
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `User goals API failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }

    const data = (await response.json()) as UserGoalsRecord;
    this.logger.log(
      `User goals API returned targetScore=${data.targetScore}, examDate=${data.examDate}`,
    );
    return data;
  }

  parseExamDate(examDate: string): string {
    const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(examDate.trim());
    if (slashMatch) {
      const [, day, month, year] = slashMatch;
      return `${year}-${month}-${day}`;
    }

    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examDate.trim());
    if (isoMatch) {
      return examDate.trim();
    }

    throw new InternalServerErrorException(
      `User goals API returned unsupported examDate format: ${examDate}`,
    );
  }
}
