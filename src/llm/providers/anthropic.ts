import type { LLMProvider, LLMRequest, LLMResponse } from "../types";
import { withRetry } from "../retry";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic" as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.anthropic.com/v1",
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const res = await withRetry(async () => {
      const system = req.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n");
      const msgs = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      const r = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          system: system || undefined,
          messages: msgs,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 1024,
        }),
      });
      if (!r.ok) {
        throw new Error(`Anthropic API error ${r.status}: ${await r.text()}`);
      }
      return r.json() as Promise<{
        content?: { text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      }>;
    });

    return {
      content: res.content?.[0]?.text ?? "",
      model: req.model,
      provider: this.name,
      usage: {
        inputTokens: res.usage?.input_tokens,
        outputTokens: res.usage?.output_tokens,
      },
    };
  }
}