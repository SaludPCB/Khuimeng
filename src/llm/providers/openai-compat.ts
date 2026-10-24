import type { LLMProvider, LLMRequest, LLMResponse, ProviderName } from "../types";
import { withRetry } from "../retry";
import { t } from "../../i18n";

export interface OpenAICompatOptions {
  name: ProviderName;
  apiKey: string;
  baseUrl: string;
}

/**
 * 通用 OpenAI 相容協議供應商。
 * NVIDIA NIM、Groq、Together、OpenRouter、Mistral、千問 DashScope（相容模式）、
 * 本地 Ollama／vLLM 等皆走 /chat/completions 同構協議——換廠商只需換 baseUrl 與 key。
 * 採 SSE 串流：NIM 等閘道對非串流長請求有 ~5 分鐘連線天花板，串流可邊生成邊保持連線。
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
    const content = await withRetry(() => this.completeStream(req));
    return {
      content,
      model: req.model,
      provider: this.name,
    };
  }

  private async completeStream(req: LLMRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens,
        stream: true,
      }),
    });
    if (!res.ok) {
      throw new Error(`${this.name} API error ${res.status}: ${await res.text()}`);
    }
    if (!res.body) {
      throw new Error(`${this.name} 回應缺少串流本體`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let content = "";
    let reasoningChars = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload) as {
            choices?: {
              delta?: { content?: string; reasoning_content?: string };
            }[];
          };
          const delta = j.choices?.[0]?.delta;
          if (typeof delta?.content === "string") content += delta.content;
          if (typeof delta?.reasoning_content === "string") {
            reasoningChars += delta.reasoning_content.length;
          }
        } catch {
          // 忽略無法解析的 SSE 塊
        }
      }
    }
    if (!content) {
      throw new Error(
        t("streamNoContent", { name: this.name }) +
          (reasoningChars > 0
            ? t("streamThinkBurn", {
                chars: reasoningChars,
                max: req.maxTokens ?? "default",
              })
            : ""),
      );
    }
    return content;
  }
}
