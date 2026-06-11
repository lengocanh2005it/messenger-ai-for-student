export interface StudentCapacityInput {
  exam_date: string;
  current_date: string;
  target_band: number;
  task1_band: number;
  task2_band: number;
  total_essays_task1: number;
  total_essays_task2: number;
}

export interface StudentCapacityReport {
  headline: string;
  streak: string;
  'tình trạng task 2': string;
  'tình trạng task 1': string;
}
