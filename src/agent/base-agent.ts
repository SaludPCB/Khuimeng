import type { LLMProvider } from "../llm/types";
import type { AgentRole } from "./role-loader";
import type { SeatConfig } from "./seat-loader";

export class BaseAgent {
  readonly name: string;
  readonly role: AgentRole;
  readonly seat: SeatConfig;
  private readonly provider: LLMProvider;

  constructor(opts: {
    name: string;
    role: AgentRole;
    seat: SeatConfig;
    provider: LLMProvider;
  }) {
    this.name = opts.name;
    this.role = opts.role;
    this.seat = opts.seat;
    this.provider = opts.provider;
  }

  get model(): string {
    return this.seat.model;
  }

  get providerName(): string {
    return this.seat.provider;
  }

  async speak(transcript: { role: "user" | "assistant"; content: string }[]): Promise<string> {
    const messages = [
      { role: "system" as const, content: this.role.systemPrompt },
      ...transcript,
    ];
    const res = await this.provider.complete({
      model: this.seat.model,
      messages,
      temperature: 0.7,
      // 報告型輸出量大；思考型模型的思考也計入額度（實測複雜任務思考可達 ~49k 字元），
      // 給足 32000 避免正文被擠掉（NIM 實測兩模型皆接受）
      maxTokens: 32000,
    });
    return res.content;
  }
}