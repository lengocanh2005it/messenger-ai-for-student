import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildInputCostEnvKey,
  buildOutputCostEnvKey,
  estimateCostUsd,
  todayUsageDate,
} from '@wispace/chat-metering';

@Injectable()
export class LlmUsageConfigService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('LLM_USAGE_ENABLED')
      ?.trim()
      .toLowerCase();

    return raw !== 'false' && raw !== '0';
  }

  todayUsageDate(): string {
    const timezone =
      this.configService.get<string>('LLM_USAGE_TIMEZONE')?.trim() ||
      'Asia/Ho_Chi_Minh';
    return todayUsageDate(timezone);
  }

  estimateCostUsdForModel(
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): string | null {
    const inputRaw = this.configService.get<string>(
      buildInputCostEnvKey(model),
    );
    const outputRaw = this.configService.get<string>(
      buildOutputCostEnvKey(model),
    );

    const inputUsdPer1M = inputRaw ? Number(inputRaw) : null;
    const outputUsdPer1M = outputRaw ? Number(outputRaw) : null;

    return estimateCostUsd(
      promptTokens,
      completionTokens,
      Number.isFinite(inputUsdPer1M) ? inputUsdPer1M : null,
      Number.isFinite(outputUsdPer1M) ? outputUsdPer1M : null,
    );
  }
}
