export interface UserCalendarRecord {
  id: number;
  userId: number;
  eventDate: string;
  time: string | null;
  createdAt?: string;
}

export interface CreateUserCalendarInput {
  eventDate: string;
  time: string;
}
