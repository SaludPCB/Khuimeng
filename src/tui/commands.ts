import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { stringify } from "yaml";
import { createProvider, type ProviderRegistry } from "../llm/factory";
import type { SeatConfig, SeatsConfig } from "../agent/seat-loader";
import { parseRoleMarkdown } from "../agent/role-loader";
import { BaseAgent } from "../agent/base-agent";
import {
  normalizeReport,
  parseReport,
  ROLES,
  VERDICT_DOMAINS,
  ReportPipeline,
  type PipelineRole,
  type ReportFrontmatter,
} from "../pipeline/report-pipeline";
import { roleReports } from "../pipeline/watcher";
import { getLang, resolveRoleFile, t } from "../i18n";
import {
  createSandbox,
  isGitRepo,
  listSandboxes,
  mergeSandbox,
  pruneSandbox,
  rollback as sandboxRollback,
  sandboxDiff,
} from "../tools/sandbox";
import type { ApprovalMode } from "../tools/approval";
import {
  isValidSessionName,
  listSessions,
  loadSession,
  renameSessionFile,
  saveSession,
} from "./sessions";

// ── 訊息模型 ──────────────────────────────────────────────────

export type MessageKind = "user" | "coder" | "viewer" | "tester" | "system" | "error" | "task";

export interface TuiMessage {
  kind: MessageKind;
  text: string;
  /** 附加摘要行（如 verdict／報告檔名） */
  meta?: string;
}

export interface ChatTurn {
  role: "user" | "coder";
  content: string;
}

// ── 指令解析（純函式） ────────────────────────────────────────

export type Command =
  | { type: "chat"; text: string }
  | { type: "help" }
  | { type: "viewer" }
  | { type: "tester" }
  | { type: "task"; text: string }
  | { type: "model"; role: string; model: string }
  | { type: "provider"; role: string; provider: string; baseUrl?: string }
  | { type: "sessions" }
  | { type: "resume"; name: string }
  | { type: "mode"; mode: string }
  | { type: "worktree"; args: string[] }
  | { type: "rollback"; n?: number }
  | { type: "rename"; name: string }
  | { type: "seats" }
  | { type: "reports" }
  | { type: "clear" }
  | { type: "exit" }
  | { type: "unknown"; name: string };

export function parseCommand(input: string): Command {
  const text = input.trim();
  if (!text) return { type: "unknown", name: "" };
  if (!text.startsWith("/")) return { type: "chat", text };
  const [name, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ");
  switch (name) {
    case "/help":
      return { type: "help" };
    case "/viewer":
      return { type: "viewer" };
    case "/tester":
      return { type: "tester" };
    case "/task":
      return { type: "task", text: arg };
    case "/model": {
      const [role, model] = rest;
      return { type: "model", role: role ?? "", model: model ?? "" };
    }
    case "/provider": {
      const [role, provider, ...base] = rest;
      return {
        type: "provider",
        role: role ?? "",
        provider: provider ?? "",
        baseUrl: base.join(" ") || undefined,
      };
    }
    case "/mode":
      return { type: "mode", mode: arg };
    case "/worktree":
      return { type: "worktree", args: rest };
    case "/rollback": {
      const n = Number(arg);
      return { type: "rollback", n: arg && Number.isInteger(n) ? n : undefined };
    }
    case "/sessions":
      return { type: "sessions" };
    case "/resume":
      return { type: "resume", name: arg };
    case "/rename":
      return { type: "rename", name: arg };
    case "/seats":
      return { type: "seats" };
    case "/reports":
      return { type: "reports" };
    case "/clear":
      return { type: "clear" };
    case "/exit":
    case "/quit":
      return { type: "exit" };
    default:
      return { type: "unknown", name: name ?? "" };
  }
}

export const HELP_TEXT: string = t("tuiHelp");

// ── 執行環境（TUI 注入） ──────────────────────────────────────

export interface TuiContext {
  mock: boolean;
  seats: SeatsConfig;
  registry?: ProviderRegistry;
  agentsDir: string;
  reportsDir: string;
  sessionsDir: string;
  /** 目前 session 名（自動存檔於 sessionsDir/<name>.json） */
  session: { name: string };
  repoRoot: string;
  /** 行動權限模式（/task --sandbox 的工具門） */
  approvalMode: ApprovalMode;
  /** 互動詢問（App 注入；ask/semi 模式顯示 y/a/n 確認） */
  askApproval?: (detail: string) => Promise<"yes" | "always" | "no">;
  messages: TuiMessage[];
  /** 對話歷史（user/coder），供 Coder 上下文與 viewer/tester 審查來源 */
  chat: ChatTurn[];
  /** 觸發重繪 */
  emit(): void;
  /** 顯示忙碌狀態（角色名或 null） */
  busy(role: string | null): void;
  exit(): void;
}

function say(ctx: TuiContext, kind: MessageKind, text: string, meta?: string): void {
  ctx.messages.push({ kind, text, meta });
  ctx.emit();
}

// ── 代理建構（席位＋快取，/model 後失效） ──────────────────────

const agentCache = new Map<string, BaseAgent>();

function buildAgent(ctx: TuiContext, role: PipelineRole): BaseAgent | null {
  const seat = ctx.seats.seats[role] as SeatConfig | undefined;
  if (!seat) return null;
  const key = `${role}:${seat.provider}:${seat.model}:${seat.base_url ?? ""}`;
  const cached = agentCache.get(key);
  if (cached) return cached;
  const provider = seat.base_url
    ? createProvider(seat.provider, undefined, seat.base_url)
    : ctx.registry?.get(seat.provider);
  if (!provider) return null;
  const raw = readFileSync(resolveRoleFile(resolve(ctx.agentsDir, `${role}.md`)), "utf-8");
  const agent = new BaseAgent({
    name: role,
    role: parseRoleMarkdown(raw, role),
    seat,
    provider,
  });
  agentCache.set(key, agent);
  return agent;
}

export function invalidateAgentCache(): void {
  agentCache.clear();
}

/** 供應商對應的環境變數（/provider 提示用） */
export const PROVIDER_ENV: Record<string, string> = {
  nvidia: "NVIDIA_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

// ── 報告徵求（單棒觸發：viewer／tester） ──────────────────────

function nextIteration(ctx: TuiContext, role: PipelineRole): number {
  return roleReports(ctx.reportsDir, role).length + 1;
}

function reportInstruction(role: PipelineRole, iteration: number): string {
  return t("reportInstruction", {
    role,
    iteration,
    domain: VERDICT_DOMAINS[role].join("/"),
  });
}

/** 對話上下文摘要（供 viewer/tester 當審查來源），截最後 12 輪 */
export function transcriptDigest(chat: ChatTurn[], keep = 12): string {
  const slice = chat.slice(-keep * 2);
  const sep = getLang() === "en" ? ": " : "：";
  return slice
    .map((turn) => `${turn.role === "user" ? t("digestBoss") : "Coder"}${sep}${turn.content}`)
    .join("\n\n");
}

function persistReport(
  ctx: TuiContext,
  role: PipelineRole,
  fm: ReportFrontmatter,
  body: string,
): string {
  mkdirSync(ctx.reportsDir, { recursive: true });
  const file = resolve(
    ctx.reportsDir,
    `${role}_${String(fm.iteration).padStart(2, "0")}_tui-chat_tui.md`,
  );
  writeFileSync(file, `---\n${stringify(fm)}---\n\n${body}\n`, "utf-8");
  return file.split("/").pop() ?? file;
}

const MOCK_VIEWER_REPORT = `---
role: viewer
iteration: 1
depends_on: []
target_files: []
verdict: approve
---

# Viewer 審查報告（mock）

## 風險清單
1. mock 模式模擬審查：無阻塞風險。

## 判定
verdict: approve（模擬）。`;

const MOCK_TESTER_REPORT = `---
role: tester
iteration: 1
depends_on: []
target_files: []
verdict: pass
---

# Tester 驗收報告（mock）

## 實測記錄（模擬數字）
- mock 模式模擬驗收：3/3 通過（模擬）。

## 判定
verdict: pass（模擬）。`;

/** 顯示用的報告預覽（截尾 N 行） */
export function reportPreview(body: string, keep = 28): string {
  const lines = body.trim().split("\n");
  if (lines.length <= keep) return body.trim();
  return `${lines.slice(0, keep).join("\n")}\n…（後續 ${lines.length - keep} 行見報告檔）`;
}

async function summonRole(ctx: TuiContext, role: "viewer" | "tester"): Promise<void> {
  const digest = transcriptDigest(ctx.chat);
  if (!digest) {
    say(ctx, "error", t("noChatYet", { role }));
    return;
  }
  const iteration = nextIteration(ctx, role);
  ctx.busy(role);
  try {
    let fm: ReportFrontmatter;
    let body: string;
    if (ctx.mock) {
      const md = role === "viewer" ? MOCK_VIEWER_REPORT : MOCK_TESTER_REPORT;
      ({ fm, body } = parseReport(md));
      fm = { ...fm, iteration };
    } else {
      const agent = buildAgent(ctx, role);
      if (!agent) {
        say(ctx, "error", t("seatUnavailable", { role }));
        return;
      }
      const raw = await agent.speak([
        {
          role: "user",
          content: `以下是任務對話紀錄（審查對象＝Coder 的最新產出）：\n\n${digest}\n\n${reportInstruction(role, iteration)}`,
        },
      ]);
      const md = normalizeReport(raw) ?? raw;
      ({ fm, body } = parseReport(md));
      if (fm.role !== role) {
        throw new Error(`回覆 role=${fm.role} 與預期 ${role} 不符`);
      }
    }
    const file = persistReport(ctx, role, fm, body);
    say(
      ctx,
      role,
      reportPreview(body),
      t("metaVerdict", { verdict: fm.verdict, n: fm.iteration, file }),
    );
  } catch (e) {
    say(ctx, "error", t("reportFail", { role, msg: (e as Error).message }));
  } finally {
    ctx.busy(null);
  }
}

// ── 對話（Coder） ─────────────────────────────────────────────

function mockCoderReply(text: string): string {
  return t("mockCoderReply", { text: text.slice(0, 60) });
}

async function chatWithCoder(ctx: TuiContext, text: string): Promise<void> {
  ctx.chat.push({ role: "user", content: text });
  say(ctx, "user", text);
  ctx.busy("coder");
  try {
    let reply: string;
    if (ctx.mock) {
      reply = mockCoderReply(text);
    } else {
      const agent = buildAgent(ctx, "coder");
      if (!agent) {
        say(ctx, "error", t("seatUnavailable", { role: "coder" }));
        return;
      }
      reply = await agent.speak(
        ctx.chat.map((t) => ({
          role: t.role === "coder" ? ("assistant" as const) : ("user" as const),
          content: t.content,
        })),
      );
    }
    ctx.chat.push({ role: "coder", content: reply });
    say(ctx, "coder", reply);
  } catch (e) {
    say(ctx, "error", t("coderFail", { msg: (e as Error).message }));
  } finally {
    ctx.busy(null);
  }
}

// ── 全自動管道（/task） ────────────────────────────────────────

async function runTask(ctx: TuiContext, taskInput: string): Promise<void> {
  const sandbox = taskInput.includes("--sandbox");
  const task = taskInput.replace(/\s*--sandbox\s*/g, " ").trim();
  if (!task) {
    say(ctx, "error", t("taskUsage"));
    return;
  }
  ctx.busy("task");
  say(ctx, "task", t("taskStart", { task }));
  try {
    const pipeline = new ReportPipeline({
      seats: ctx.seats,
      registry: ctx.registry,
      mock: ctx.mock,
      agentsDir: ctx.agentsDir,
      reportsDir: ctx.reportsDir,
      signature: "tui",
      sandbox,
      repoRoot: ctx.repoRoot,
      approval: sandbox
        ? {
            mode: ctx.approvalMode,
            ask: ctx.askApproval
              ? async (req) => ctx.askApproval!(req.detail)
              : undefined,
          }
        : undefined,
      log: (line) => say(ctx, "task", line),
    });
    const result = await pipeline.run(task);
    say(
      ctx,
      "system",
      result.status === "delivered" ? t("taskDelivered") : t("taskCircuit"),
    );
  } catch (e) {
    say(ctx, "error", t("pipelineFail", { msg: (e as Error).message }));
  } finally {
    ctx.busy(null);
  }
}

// ── 指令分派 ──────────────────────────────────────────────────

export async function executeCommand(ctx: TuiContext, input: string): Promise<void> {
  const cmd = parseCommand(input);
  switch (cmd.type) {
    case "chat":
      await chatWithCoder(ctx, cmd.text);
      return;
    case "help":
      say(ctx, "system", HELP_TEXT);
      return;
    case "viewer":
    case "tester":
      await summonRole(ctx, cmd.type);
      return;
    case "task":
      await runTask(ctx, cmd.text);
      return;
    case "model": {
      if (!ROLES.includes(cmd.role as PipelineRole)) {
        say(ctx, "error", t("modelRoleInvalid"));
        return;
      }
      if (!cmd.model) {
        say(ctx, "error", t("modelNeedId"));
        return;
      }
      (ctx.seats.seats[cmd.role] as SeatConfig).model = cmd.model;
      invalidateAgentCache();
      say(ctx, "system", t("modelSwitched", { role: cmd.role, model: cmd.model }));
      return;
    }
    case "provider": {
      if (!ROLES.includes(cmd.role as PipelineRole) || !cmd.provider) {
        say(ctx, "error", t("providerUsage"));
        return;
      }
      if (!PROVIDER_ENV[cmd.provider]) {
        say(ctx, "error", t("providerInvalid"));
        return;
      }
      const seat = ctx.seats.seats[cmd.role] as SeatConfig;
      seat.provider = cmd.provider as SeatConfig["provider"];
      if (cmd.baseUrl) seat.base_url = cmd.baseUrl;
      invalidateAgentCache();
      say(
        ctx,
        "system",
        t("providerSwitched", {
          role: cmd.role,
          provider: cmd.provider,
          env: PROVIDER_ENV[cmd.provider] ?? "",
        }),
      );
      return;
    }
    case "mode": {
      if (cmd.mode !== "ask" && cmd.mode !== "semi" && cmd.mode !== "auto") {
        say(ctx, "error", t("modeUsage"));
        return;
      }
      ctx.approvalMode = cmd.mode;
      say(ctx, "system", t("modeSwitched", { mode: cmd.mode }));
      return;
    }
    case "worktree": {
      const [sub, id] = cmd.args;
      if (!isGitRepo(ctx.repoRoot)) {
        say(ctx, "error", t("notGitRepo"));
        return;
      }
      try {
        switch (sub ?? "list") {
          case "list": {
            const list = listSandboxes(ctx.repoRoot);
            if (list.length === 0) {
              say(ctx, "system", t("worktreeNone"));
              return;
            }
            say(
              ctx,
              "system",
              list
                .map((sb) =>
                  t("worktreeLine", {
                    id: sb.id,
                    n: sb.checkpoints,
                    dirty: sb.dirty ? t("worktreeDirty") : t("worktreeClean"),
                  }),
                )
                .join("\n"),
            );
            return;
          }
          case "new": {
            const sb = createSandbox(ctx.repoRoot);
            say(ctx, "system", t("sandboxCreated", { id: sb.id, branch: sb.branch, dir: sb.dir }));
            return;
          }
          case "diff": {
            if (!id) {
              say(ctx, "error", t("worktreeUsage"));
              return;
            }
            say(ctx, "system", sandboxDiff(ctx.repoRoot, id));
            return;
          }
          case "merge": {
            if (!id) {
              say(ctx, "error", t("worktreeUsage"));
              return;
            }
            mergeSandbox(ctx.repoRoot, id);
            say(ctx, "system", t("worktreeMerged", { id }));
            return;
          }
          case "prune": {
            if (!id) {
              say(ctx, "error", t("worktreeUsage"));
              return;
            }
            pruneSandbox(ctx.repoRoot, id);
            say(ctx, "system", t("worktreePruned", { id }));
            return;
          }
          default:
            say(ctx, "error", t("worktreeUsage"));
            return;
        }
      } catch (e) {
        say(ctx, "error", (e as Error).message);
        return;
      }
    }
    case "rollback": {
      const list = listSandboxes(ctx.repoRoot);
      const newest = list[0];
      if (!newest) {
        say(ctx, "error", t("worktreeNone"));
        return;
      }
      const n = cmd.n && cmd.n > 0 ? cmd.n : 1;
      try {
        sandboxRollback(ctx.repoRoot, newest.id, n);
        say(ctx, "system", t("rollbackDone", { id: newest.id, n }));
      } catch (e) {
        say(ctx, "error", (e as Error).message);
      }
      return;
    }
    case "sessions": {
      const list = listSessions(ctx.sessionsDir).slice(0, 10);
      if (list.length === 0) {
        say(ctx, "system", t("sessionsNone"));
        return;
      }
      say(
        ctx,
        "system",
        `${t("sessionsTitle")}\n${list
          .map((x) =>
            t("sessionLine", {
              name: x.name,
              turns: x.turns,
              time: x.updatedAt.replace("T", " ").slice(0, 19),
            }),
          )
          .join("\n")}`,
      );
      return;
    }
    case "resume": {
      const name = cmd.name.trim();
      if (!name || !isValidSessionName(name)) {
        say(ctx, "error", t("sessionNameInvalid"));
        return;
      }
      const data = loadSession(ctx.sessionsDir, name);
      if (!data) {
        say(ctx, "error", t("sessionNotFound", { name }));
        return;
      }
      ctx.chat.length = 0;
      ctx.chat.push(...data.chat);
      ctx.messages.length = 0;
      ctx.messages.push(...data.messages);
      ctx.session.name = name;
      say(ctx, "system", t("sessionResumed", { name, n: Math.floor(data.chat.length / 2) }));
      return;
    }
    case "rename": {
      const name = cmd.name.trim();
      if (!name || !isValidSessionName(name)) {
        say(ctx, "error", t("sessionNameInvalid"));
        return;
      }
      renameSessionFile(ctx.sessionsDir, ctx.session.name, name);
      ctx.session.name = name;
      saveSession(ctx);
      say(ctx, "system", t("sessionRenamed", { name }));
      return;
    }
    case "seats": {
      const lines = ROLES.map(
        (r) => `  ${r.padEnd(6)} ${ctx.seats.seats[r]?.provider ?? "?"} / ${ctx.seats.seats[r]?.model ?? "?"}`,
      );
      say(ctx, "system", `${t("seatsTitle")}\n${lines.join("\n")}`);
      return;
    }
    case "reports": {
      let files: string[] = [];
      try {
        files = readdirSync(ctx.reportsDir).filter((f) => f.endsWith(".md"));
      } catch {
        // 目錄尚不存在
      }
      if (files.length === 0) {
        say(ctx, "system", t("reportsNone"));
        return;
      }
      const sorted = files.slice().sort((a, b) => b.localeCompare(a)).slice(0, 10);
      say(ctx, "system", `${t("reportsRecent")}\n${sorted.map((f) => `  ${f}`).join("\n")}`);
      return;
    }
    case "clear":
      ctx.chat.length = 0;
      ctx.messages.length = 0;
      say(ctx, "system", t("cleared"));
      return;
    case "exit":
      ctx.exit();
      return;
    case "unknown":
      if (!cmd.name) return;
      say(ctx, "error", t("unknownCmd", { name: cmd.name }));
      return;
  }
}
