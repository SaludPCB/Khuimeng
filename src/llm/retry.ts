import type { LLMRequest, LLMResponse } from "./types";

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 500,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const max = attempt >= retries;
      const isRateLimit =
        typeof err === "object" &&
        err !== null &&
        ((err as { status?: number }).status === 429 ||
          (err as { message?: string }).message?.toLowerCase().includes("rate limit"));
      if (max || !isRateLimit) throw err;
      const delay =
        baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}