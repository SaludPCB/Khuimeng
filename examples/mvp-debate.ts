/**
 * Khuimeng MVP：雙 Agent 雙模型辯論
 * 使用：bun run examples/mvp-debate.ts
 * 需要設定環境變數（至少兩個供應商）：
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY / DEEPSEEK_API_KEY
 */
import { createRegistry } from "../src/llm/factory";
import { loadSeats } from "../src/agent/seat-loader";
import { loadRole, parseRoleMarkdown } from "../src/agent/role-loader";
import { BaseAgent } from "../src/agent/base-agent";
import { DebateEngine } from "../src/debate/engine";
import { TerminalRoom } from "../src/ui/terminal-room";

const topic = process.argv[2] ?? "開源 AI Agent 專案應該用哪種語言？";

const seats = loadSeats();
const registry = createRegistry();

function buildAgent(name: string): BaseAgent {
  const seat = seats.seats[name];
  if (!seat) throw new Error(`座席不存在: ${name}`);
  const provider = registry.get(seat.provider);
  if (!provider) {
    throw new Error(`供應商 ${seat.provider} 未設定 API key`);
  }
  const role = parseRoleMarkdown(loadRole(name), name);
  return new BaseAgent({ name, role, seat, provider });
}

const moderator = buildAgent("moderator");
const members = [buildAgent("socrates"), buildAgent("critic")];

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
