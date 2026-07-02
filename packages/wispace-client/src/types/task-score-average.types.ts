export interface TaskScoreAverageRecord {
  id: number;
  userId: number;
  task: string;
  avgTaskAchievement: number;
  avgCoherenceCohesion: number;
  avgLexicalResource: number;
  avgGrammaticalRangeAccuracy: number;
  avgTotalScore: number;
  task1Count: number;
  task2Count: number;
  totalTasks: number;
  currentStreak: number;
  highestStreak: number;
  totalPracticeTimeMinutes: number;
}
