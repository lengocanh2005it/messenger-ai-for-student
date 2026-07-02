import type { StudentCapacityInput } from './types';

/** Fetches capacity input for the LLM prompt — implemented per platform (Wispace API). */
export interface CapacityDataPort {
  getCapacityData(externalUserId: string): Promise<StudentCapacityInput>;
}
