export function isRescheduleIntent(userText: string): boolean {
  const text = userText.trim().toLowerCase();
  if (!text) {
    return false;
  }

  const wantsChange = /(đổi|dời|chuyển|hoãn)/i.test(text);
  const aboutSchedule = /(lịch|buổi\s*học|giờ\s*học|lịch\s*học)/i.test(text);

  return wantsChange && aboutSchedule;
}

export function hasExplicitRescheduleTarget(userText: string): boolean {
  const text = userText.trim().toLowerCase();
  if (!text) {
    return false;
  }

  if (/\d{1,2}[/\-.]\d{1,2}/.test(text)) {
    return true;
  }

  if (
    /buổi\s+(ngày\s+)?mai|hôm\s+nay|ngày\s+kia|buổi\s+gần\s+nhất/.test(text)
  ) {
    return true;
  }

  if (/thứ\s+[2-7]|chủ\s+nhật/.test(text)) {
    return true;
  }

  if (/\d{1,2}\s*h(?:\s*\d{1,2})?|\d{1,2}:\d{2}/.test(text)) {
    return true;
  }

  return false;
}
