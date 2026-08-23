import type { ChatMessage, LLMProvider, LLMRequest, LLMResponse, ProviderName } from "../types";
import { withRetry } from "../retry";

export class OpenAIProvider implements LLMProvider {
  readonly name: ProviderName = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
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
        throw new Error(`OpenAI API error ${r.status}: ${await r.text()}`);
      }
      return r.json() as Promise<{
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>;
    });

    const msg = res.choices?.[0]?.message?.content ?? "";
    return {
      content: msg,
      model: req.model,
      provider: this.name,
      usage: {
        inputTokens: res.usage?.prompt_tokens,
        outputTokens: res.usage?.completion_tokens,
      },
    };
  }
}

export function isOpenAIProvider(p: LLMProvider): p is OpenAIProvider {
  return p.name === "openai";
}

export type { ProviderName };