import type { LLMProvider, LLMRequest, LLMResponse, ProviderName } from "./types";
import { OpenAIProvider } from "./providers/openai";
import { AnthropicProvider } from "./providers/anthropic";
import { DeepSeekProvider } from "./providers/deepseek";
import { OpenAICompatProvider } from "./providers/openai-compat";

export interface ProviderRegistry {
  get(name: ProviderName): LLMProvider | undefined;
  all(): LLMProvider[];
}

/** NVIDIA NIM 預設端點；其他 OpenAI 相容廠商透過 seat 的 base_url 覆寫 */
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function createProvider(
  name: ProviderName,
  apiKey?: string,
  baseUrl?: string,
): LLMProvider | undefined {
  switch (name) {
    case "openai":
      return apiKey || process.env.OPENAI_API_KEY
        ? new OpenAIProvider(apiKey ?? process.env.OPENAI_API_KEY!, baseUrl ?? "https://api.openai.com/v1")
        : undefined;
    case "anthropic":
      return apiKey || process.env.ANTHROPIC_API_KEY
        ? new AnthropicProvider(apiKey ?? process.env.ANTHROPIC_API_KEY!)
        : undefined;
    case "deepseek":
      return apiKey || process.env.DEEPSEEK_API_KEY
        ? new DeepSeekProvider(apiKey ?? process.env.DEEPSEEK_API_KEY!)
        : undefined;
    case "nvidia":
      return apiKey || process.env.NVIDIA_API_KEY
        ? new OpenAICompatProvider({
            name: "nvidia",
            apiKey: apiKey ?? process.env.NVIDIA_API_KEY!,
            baseUrl: baseUrl ?? NVIDIA_BASE_URL,
          })
        : undefined;
    case "google":
      return apiKey || process.env.GOOGLE_API_KEY
        ? new GoogleProvider(apiKey ?? process.env.GOOGLE_API_KEY!)
        : undefined;
    default:
      return undefined;
  }
}

class GoogleProvider implements LLMProvider {
  readonly name = "google" as const;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta",
  ) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const url = `${this.baseUrl}/models/${req.model}:generateContent?key=${this.apiKey}`;
    const system = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: req.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
        generationConfig: {
          temperature: req.temperature ?? 0.7,
          maxOutputTokens: req.maxTokens,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Google API error ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
      model: req.model,
      provider: this.name,
    };
  }
}

export function createRegistry(
  config: Partial<Record<ProviderName, string>> = {},
): ProviderRegistry {
  const providers = new Map<ProviderName, LLMProvider>();
  for (const name of ["openai", "anthropic", "google", "deepseek", "nvidia"] as ProviderName[]) {
    const p = createProvider(name, config[name]);
    if (p) providers.set(name, p);
  }
  return {
    get: (name) => providers.get(name),
    all: () => [...providers.values()],
  };
}