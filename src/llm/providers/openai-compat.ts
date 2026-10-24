import type { LLMProvider, LLMRequest, LLMResponse, ProviderName } from "../types";
import { withRetry } from "../retry";

export interface OpenAICompatOptions {
  name: ProviderName;
  apiKey: string;
  baseUrl: string;
}

/**
 * 通用 OpenAI 相容協議供應商。
 * NVIDIA NIM、Groq、Together、OpenRouter、Mistral、千問 DashScope（相容模式）、
 * 本地 Ollama／vLLM 等皆走 /chat/completions 同構協議——換廠商只需換 baseUrl 與 key。
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly name: ProviderName;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(opts: OpenAICompatOptions) {
    this.name = opts.name;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
  }

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
        throw new Error(`${this.name} API error ${r.status}: ${await r.text()}`);
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
