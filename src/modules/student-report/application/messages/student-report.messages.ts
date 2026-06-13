/** R1: học viên chưa có bài chấm / score trên Wispace. */
export function buildStudentReportNoScoreDataMessage(): string {
  return (
    'Mình chưa thấy bài Writing nào được chấm trên WISPACE để tổng hợp báo cáo.\n\n' +
    'Bạn làm thêm vài bài Task 1 / Task 2 trên app, rồi bấm lại «Xem tiến độ học tập» hoặc nhắn mình nhé.'
  );
}

/** R3: Wispace API 4xx / dữ liệu không đủ. */
export function buildStudentReportApiUnavailableMessage(): string {
  return (
    'Mình chưa lấy được đủ dữ liệu học tập từ WISPACE để tổng hợp báo cáo ngay bây giờ.\n\n' +
    'Bạn thử lại sau vài phút hoặc kiểm tra đã đăng nhập đúng tài khoản trên app nhé.'
  );
}

/** R3: Wispace API 5xx — menu / ops gửi thay vì im lặng. */
export function buildStudentReportApiRetryMessage(): string {
  return (
    'Hệ thống WISPACE đang bận nên mình chưa tổng hợp được báo cáo.\n\n' +
    'Bạn thử bấm lại «Xem tiến độ học tập» sau 15–30 phút nhé.'
  );
}
