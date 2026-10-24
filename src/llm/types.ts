export type ProviderName = "openai" | "anthropic" | "google" | "deepseek" | "nvidia";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: ProviderName;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface LLMProvider {
  readonly name: ProviderName;
  complete(req: LLMRequest): Promise<LLMResponse>;
}
