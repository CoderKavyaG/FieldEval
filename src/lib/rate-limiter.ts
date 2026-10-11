// In-Memory Rate Limiter Store

export interface RateLimiterState {
  ipTimestamps: Map<string, number[]>;
  currentDay: string;
  dailyCount: number;
}

export const rateLimiterState: RateLimiterState = {
  ipTimestamps: new Map(),
  currentDay: new Date().toISOString().slice(0, 10),
  dailyCount: 0,
};

export function resetRateLimiterForTests(): void {
  rateLimiterState.ipTimestamps.clear();
  rateLimiterState.currentDay = new Date().toISOString().slice(0, 10);
  rateLimiterState.dailyCount = 0;
}
