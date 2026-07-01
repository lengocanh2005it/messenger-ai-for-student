import { ConfigService } from '@nestjs/config';

export function readMessengerBubbleLimits(configService: ConfigService): {
  maxBubbles: number;
  maxCharsPerBubble: number;
} {
  const maxBubbles = Number(configService.get<string>('CHAT_MAX_BUBBLES') ?? 4);
  const maxCharsPerBubble = Number(
    configService.get<string>('CHAT_BUBBLE_MAX_CHARS') ?? 640,
  );

  return {
    maxBubbles: Number.isFinite(maxBubbles) && maxBubbles > 0 ? maxBubbles : 4,
    maxCharsPerBubble:
      Number.isFinite(maxCharsPerBubble) && maxCharsPerBubble > 0
        ? maxCharsPerBubble
        : 640,
  };
}
