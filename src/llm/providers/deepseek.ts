import type { LLMProvider, LLMRequest, LLMResponse } from "../types";
import { withRetry } from "../retry";

export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek" as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.deepseek.com/v1",
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const res = await withRetry(async () => {
      const r = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens,
        }),
      });
      if (!r.ok) {
        throw new Error(`DeepSeek API error ${r.status}: ${await r.text()}`);
      }
      return r.json() as Promise<{
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
    });

    return {
      content: res.choices?.[0]?.message?.content ?? "",
      model: req.model,
      provider: this.name,
      usage: {
        inputTokens: res.usage?.prompt_tokens,
        outputTokens: res.usage?.completion_tokens,
      },
    };
  }
}