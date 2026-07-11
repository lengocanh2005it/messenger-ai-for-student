export type RescheduleSchedulingMode =
  | 'default_next_day_same_time'
  | 'explicit';

export interface ResolvedStudyCalendarSlot {
  eventDate: string;
  time: string;
  localDate: string;
  schedulingMode: RescheduleSchedulingMode;
}
