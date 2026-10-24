import type { BaseAgent } from "../../src/agent/base-agent";
import { ConsensusEvaluator, type ConsensusResult } from "./consensus";
import { MemoryManager, type DebateTranscript } from "./memory-manager";

export interface DebateOptions {
  maxRounds: number;
  forceConsensusThreshold: number;
  requireDissenting: number;
  onSpeech?: (agent: BaseAgent, content: string, round: number) => void;
}

export interface DebateOutcome {
  transcript: DebateTranscript;
  consensus: ConsensusResult;
}

export class DebateEngine {
  private readonly evaluator: ConsensusEvaluator;
  private readonly memory: MemoryManager;
  private readonly transcript: DebateTranscript = { topic: "", rounds: [] };

  constructor(
    private readonly moderator: BaseAgent,
    private readonly members: BaseAgent[],
    private readonly options: DebateOptions,
  ) {
    this.evaluator = new ConsensusEvaluator(options.forceConsensusThreshold);
    this.memory = new MemoryManager();
  }

  async run(topic: string): Promise<DebateOutcome> {
    this.transcript.topic = topic;
    this.transcript.rounds = [];

    const agreementSignals: number[] = [];

    const intro = await this.moderator.speak([
      {
        role: "user",
        content: `請作為主持人，將議題「${topic}」拆解為子命題，宣布辯論開始。發言請簡短（100 字內）。`,
      },
    ]);
    this.options.onSpeech?.(this.moderator, intro, 0);

    const critic = this.members.find((m) => m.name === "critic");
    const speakers =
      critic && this.options.requireDissenting > 0
        ? [...this.members.filter((m) => m.name !== "critic"), critic]
        : this.members;

    for (let round = 1; round <= this.options.maxRounds; round++) {
      const speeches: Record<string, string> = {};

      for (const member of speakers) {
        const ctx = this.memory.getContextSummary();
        const content = await member.speak([
          ...(ctx ? [{ role: "assistant" as const, content: ctx }] : []),
          {
            role: "user",
            content: `請針對議題「${topic}」發言，提出你的專業觀點（第 ${round} 輪）。`,
          },
        ]);
        speeches[member.name] = content;
        this.options.onSpeech?.(member, content, round);
      }

      this.transcript.rounds.push({ round, speeches });
      agreementSignals.push(1);

      const consensus = this.evaluator.evaluate(
        agreementSignals,
        this.options.forceConsensusThreshold > 0.5,
      );

      if (round === this.options.maxRounds) {
        const summary = this.memory.summarizeRound(
          this.transcript.rounds.at(-1)!,
          topic,
        );
        this.transcript.summary = summary;
        return { transcript: this.transcript, consensus };
      }
    }

    this.transcript.summary = this.memory.summarizeRound(
      this.transcript.rounds.at(-1)!,
      topic,
    );
    return {
      transcript: this.transcript,
      consensus: this.evaluator.evaluate(agreementSignals),
    };
  }
}