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
      const message =
        typeof err === "object" && err !== null
          ? ((err as { message?: string }).message ?? "")
          : String(err);
      const isRateLimit =
        typeof err === "object" &&
        err !== null &&
        ((err as { status?: number }).status === 429 ||
          message.toLowerCase().includes("rate limit"));
      // 網路暫態錯誤（連線被斷／超時／DNS）也值得重試——長生成特別容易遇到
      const isTransientNetwork =
        /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network error/i.test(
          message,
        );
      if (max || (!isRateLimit && !isTransientNetwork)) throw err;
      const delay =
        baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}