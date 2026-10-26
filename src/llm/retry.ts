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
          /rate limit|\b429\b|too many requests/i.test(message));
      // 網路暫態錯誤（連線被斷／超時／DNS）與伺服器端空回應也值得重試——長生成特別容易遇到
      const isTransientNetwork =
        /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network error/i.test(
          message,
        );
      // NIM 偶發回 200 但串流全空（無思考無正文）——重試通常即恢復
      const isEmptyStream =
        /串流結束但無正文內容|stream ended with no content/i.test(message);
      // 限流給額外兩次機會與更長退避（NIM 免費額度需數十秒恢復）
      const limit = isRateLimit ? retries + 2 : retries;
      if (attempt >= limit || (!isRateLimit && !isTransientNetwork && !isEmptyStream)) {
        throw err;
      }
      const delay = isRateLimit
        ? 8000 * attempt + Math.floor(Math.random() * 1000)
        : baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}