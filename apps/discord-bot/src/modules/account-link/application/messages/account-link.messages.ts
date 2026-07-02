const FALLBACK_NAME = 'bạn';

export function buildDiscordLinkWelcomeMessage(displayName?: string): string {
  const name = displayName?.trim() || FALLBACK_NAME;
  return `Chào ${name}! Mình là trợ lý WISPACE. Bạn có thể hỏi về tiến độ học, lịch học sắp tới, hoặc mục tiêu band — cứ nhắn tự nhiên nhé 🎓`;
}
