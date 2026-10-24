export interface DebateRound {
  round: number;
  speeches: Record<string, string>; // agentName -> content
}

export interface DebateTranscript {
  topic: string;
  rounds: DebateRound[];
  summary?: string;
}

export class MemoryManager {
  private summary: string | undefined;

  summarizeRound(round: DebateRound, topic: string): string {
    const lines = Object.entries(round.speeches).map(
      ([name, content]) => `- ${name}: ${content.slice(0, 200)}`,
    );
    const raw = `第 ${round.round} 輪討論摘要（${topic}）:\n${lines.join("\n")}`;
    this.summary = raw;
    return raw;
  }

  getContextSummary(): string | undefined {
    return this.summary;
  }

  reset(): void {
    this.summary = undefined;
  }
}