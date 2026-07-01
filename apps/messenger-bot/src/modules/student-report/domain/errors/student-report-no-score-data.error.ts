/** R1: Wispace TaskScoreAverage trả về rỗng — không phải lỗi hạ tầng. */
export class StudentReportNoScoreDataError extends Error {
  constructor(psid: string) {
    super(`No TaskScoreAverage data for psid=${psid}`);
    this.name = 'StudentReportNoScoreDataError';
  }
}
