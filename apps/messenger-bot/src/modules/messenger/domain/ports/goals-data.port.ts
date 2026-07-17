export interface UserGoalsRecord {
  targetScore: number;
  examDate: string;
}

export const GOALS_DATA_PORT = Symbol('GOALS_DATA_PORT');

export interface GoalsDataPort {
  getUserGoals(psid: string): Promise<UserGoalsRecord>;
}
