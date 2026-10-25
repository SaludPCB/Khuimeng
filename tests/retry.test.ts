import { describe, expect, it } from "vitest";
import { withRetry } from "../src/llm/retry";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withRetry：暫態錯誤分類", () => {
  it("空流（NIM 偶發）會重試到成功", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw Object.assign(new Error("nvidia 串流結束但無正文內容"), {
            name: "EmptyStream",
          });
        }
        return "ok";
      },
      3,
      1,
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("英文版空流訊息同樣重試", async () => {
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error("nvidia stream ended with no content");
        return 42;
      },
      3,
      1,
    );
    expect(calls).toBe(2);
  });

  it("非暫態錯誤不重試（直接拋）", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("nvidia API error 404: model not found");
        },
        3,
        1,
      ),
    ).rejects.toThrow("404");
    expect(calls).toBe(1);
  });

  it("次數用盡後原錯拋出", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("fetch failed");
        },
        2,
        1,
      ),
    ).rejects.toThrow("fetch failed");
    expect(calls).toBe(2);
    await sleep(10);
  });
});
