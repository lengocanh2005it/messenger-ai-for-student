/** No scored Writing tasks on WISPACE yet. */
export function buildStudentReportNoScoreDataMessage(): string {
  return (
    'Mình chưa thấy bài Writing nào được chấm trên WISPACE để tổng hợp báo cáo.\n\n' +
    'Bạn làm thêm vài bài Task 1 / Task 2 trên app — WISPACE sẽ gửi báo cáo tự động, hoặc bạn nhắn mình nhé.'
  );
}

/** Wispace API 4xx / insufficient data. */
export function buildStudentReportApiUnavailableMessage(): string {
  return (
    'Mình chưa lấy được đủ dữ liệu học tập từ WISPACE để tổng hợp báo cáo ngay bây giờ.\n\n' +
    'Bạn thử lại sau vài phút hoặc kiểm tra đã đăng nhập đúng tài khoản trên app nhé.'
  );
}

/** Wispace API 5xx — cron / ops sends this instead of staying silent. */
export function buildStudentReportApiRetryMessage(): string {
  return (
    'Hệ thống WISPACE đang bận nên mình chưa tổng hợp được báo cáo.\n\n' +
    'Bạn thử lại sau 15–30 phút nhé.'
  );
}
