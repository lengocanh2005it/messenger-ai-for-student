/** L3: PSID giữ nguyên, user đổi tài khoản WISPACE (ref mới). */
export function buildMappingUserIdRelinkedMessage(userId: number): string {
  return (
    `Mình đã cập nhật liên kết Messenger với tài khoản WISPACE (user #${userId}).\n\n` +
    'Từ giờ báo cáo và nhắc lịch sẽ theo tài khoản mới của bạn nhé.'
  );
}
