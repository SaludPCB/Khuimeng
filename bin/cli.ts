#!/usr/bin/env node
import { resolve } from "node:path";
import { createRegistry } from "../src/llm/factory";
import { loadSeats } from "../src/agent/seat-loader";
import { loadRole, parseRoleMarkdown } from "../src/agent/role-loader";
import { BaseAgent } from "../src/agent/base-agent";
import { DebateEngine } from "../src/debate/engine";
import { TerminalRoom } from "../src/ui/terminal-room";

const topic = process.argv.slice(2).join(" ") || "AI 是否會取代軟體工程師？";

const root = resolve(import.meta.dirname, "..");
const seats = loadSeats(resolve(root, "configs/seats.yaml"));
const registry = createRegistry();

function buildAgent(name: string): BaseAgent {
  const seat = seats.seats[name];
  if (!seat) throw new Error(`座席不存在: ${name}`);
  const provider = registry.get(seat.provider);
  if (!provider) {
    throw new Error(
      `供應商 ${seat.provider} 未設定 API key（請設定環境變數）`,
    );
  }
  const role = parseRoleMarkdown(
    loadRole(name, resolve(root, "agents")),
    name,
  );
  return new BaseAgent({ name, role, seat, provider });
}

const moderator = buildAgent("moderator");
const members = ["socrates", "feynman", "critic"].map(buildAgent);

const room = new TerminalRoom();
room.renderIntro(topic);

const engine = new DebateEngine(moderator, members, {
  maxRounds: seats.rules.max_rounds,
  forceConsensusThreshold: seats.rules.force_counterfactual_if_consensus_gt ?? 0.7,
  requireDissenting: seats.rules.require_dissenting_members ?? 1,
  onSpeech: (agent, content, round) => room.renderSpeech({ agent, content, round }),
});

const outcome = await engine.run(topic);
room.renderSummary(outcome.transcript.summary ?? "（無摘要）");
