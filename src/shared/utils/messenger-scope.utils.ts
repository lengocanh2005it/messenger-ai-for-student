const IN_SCOPE_HINTS =
  /wispace|ielts|writing|task\s*1|task\s*2|lịch\s*học|buổi\s*học|tiến\s*độ|báo\s*cáo|band|mục\s*tiêu|ngày\s*thi|đổi\s*lịch|dời\s*lịch|nhắc\s*lịch|đăng\s*ký|học\s*viên|luyện\s*đề|essay|graph|chart|process/i;

const OFF_TOPIC_PATTERNS = [
  /thời\s*tiết|weather|mưa\s*hôm nay/i,
  /bóng\s*đá|world\s*cup|phim\s+|game\s+|netflix/i,
  /bitcoin|crypto|chứng\s*khoán|forex/i,
  /nấu\s*ăn|công\s*thức\s*nấu|recipe/i,
  /chính\s*trị|bầu\s*cử|tổng\s*thống/i,
  /python|javascript|java\s+code|lập\s*trình\s+web/i,
  /toán\s+lớp|vật\s+lý|hóa\s+học(?!\s*ielts)/i,
] as const;

const GREETING_ONLY =
  /^(?:hello|hi|hey|chào|xin chào|ok|oke|ừ|vâng|cảm ơn|thanks|thank you)[\s!.?]*$/i;

export function isObviouslyOffTopic(userText: string): boolean {
  const text = userText.trim();
  if (!text || GREETING_ONLY.test(text)) {
    return false;
  }

  if (IN_SCOPE_HINTS.test(text)) {
    return false;
  }

  return OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
}
