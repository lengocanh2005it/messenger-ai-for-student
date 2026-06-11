import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserGoalsRecord } from '../../domain/types/user-goals.types';

@Injectable()
export class UserGoalsApiService {
  private readonly logger = new Logger(UserGoalsApiService.name);

  constructor(private readonly configService: ConfigService) {}

  async getUserGoals(psid: string): Promise<UserGoalsRecord> {
    const url =
      this.configService.get<string>('WISPACE_API_USER_GOALS_URL') ??
      'https://backend.aihubproduction.com/api/User/goals';

    const response = await fetch(url, {
      headers: this.buildWispaceHeaders(psid),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `User goals API failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }

    const data = (await response.json()) as UserGoalsRecord;
    this.logger.log(
      `User goals API returned targetScore=${data.targetScore}, examDate=${data.examDate} (psid=${psid})`,
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

  buildWispaceHeaders(psid: string): Record<string, string> {
    if (!psid.trim()) {
      throw new InternalServerErrorException(
        'PSID is required for WISPACE API requests',
      );
    }

    return {
      'x-psid': psid.trim(),
      Accept: 'application/json',
    };
  }
}
