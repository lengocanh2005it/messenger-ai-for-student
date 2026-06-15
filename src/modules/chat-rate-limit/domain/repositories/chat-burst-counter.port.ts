export const CHAT_BURST_COUNTER = Symbol('CHAT_BURST_COUNTER');

export interface ChatBurstCounterPort {
  getBurstCount(psid: string): Promise<number>;
  recordReservation(psid: string): Promise<void>;
  releaseReservation(psid: string): Promise<void>;
}
