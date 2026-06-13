/** R1: học viên chưa có bài chấm / score trên Wispace. */
export function buildStudentReportNoScoreDataMessage(): string {
  return (
    'Mình chưa thấy bài Writing nào được chấm trên WISPACE để tổng hợp báo cáo.\n\n' +
    'Bạn làm thêm vài bài Task 1 / Task 2 trên app, rồi bấm lại «Xem tiến độ học tập» hoặc nhắn mình nhé.'
  );
}
