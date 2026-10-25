import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { resolveRoleFile, t } from "../i18n";
import {
  checkpoint as sandboxCheckpoint,
  createSandbox,
  sandboxDiff,
  type SandboxInfo,
} from "../tools/sandbox";
import { makeFileTools } from "../tools/file-tools";
import { ApprovalGate, type ApprovalMode, type AskFn } from "../tools/approval";
import { runAgentLoop } from "../tools/agent-loop";
import { createProvider, type ProviderRegistry } from "../llm/factory";
import type { SeatConfig, SeatsConfig } from "../agent/seat-loader";
import { parseRoleMarkdown } from "../agent/role-loader";
import { BaseAgent } from "../agent/base-agent";

export const ROLES = ["coder", "viewer", "tester"] as const;
export type PipelineRole = (typeof ROLES)[number];

export type Verdict = "na" | "approve" | "request_changes" | "pass" | "blocked";

/** 判定值域鎖死：跨值域即違約 */
export const VERDICT_DOMAINS: Record<PipelineRole, readonly Verdict[]> = {
  coder: ["na"],
  viewer: ["approve", "request_changes"],
  tester: ["pass", "blocked"],
};

export interface ReportFrontmatter {
  role: PipelineRole;
  iteration: number;
  depends_on: string[];
  target_files: string[];
  verdict: Verdict;
}

export type ValidationResult =
  | { ok: true; fm: ReportFrontmatter }
  | { ok: false; errors: string[] };

/** 校驗報告 frontmatter：五欄齊全＋verdict 落在該角色值域 */
export function validateFrontmatter(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: [t("fmNotObject")] };
  }
  const fm = input as Record<string, unknown>;
  const errors: string[] = [];
  const role = fm.role as PipelineRole;
  if (!ROLES.includes(role)) {
    errors.push(t("roleInvalid", { role: String(fm.role) }));
  } else if (!VERDICT_DOMAINS[role].includes(fm.verdict as Verdict)) {
    errors.push(
      t("verdictDomain", {
        verdict: String(fm.verdict),
        role,
        domain: VERDICT_DOMAINS[role].join("/"),
      }),
    );
  }
  if (
    typeof fm.iteration !== "number" ||
    !Number.isInteger(fm.iteration) ||
    fm.iteration < 1
  ) {
    errors.push(t("iterationInvalid", { value: String(fm.iteration) }));
  }
  for (const key of ["depends_on", "target_files"] as const) {
    if (!Array.isArray(fm[key])) errors.push(t("keyArray", { key }));
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, fm: fm as unknown as ReportFrontmatter };
}

/** 自 Markdown 文本解析 --- 圍欄 frontmatter ＋本文 */
export function parseReport(md: string): { fm: ReportFrontmatter; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!m || m[1] === undefined) {
    throw new Error(t("fmMissingFence"));
  }
  const v = validateFrontmatter(parse(m[1]));
  if (!v.ok) {
    throw new Error(t("fmInvalid", { errors: v.errors.join("；") }));
  }
  return { fm: v.fm, body: m[2] ?? "" };
}

/**
 * LLM 輸出正規化：真實模型常見雜訊——整體被 ``` 圍欄包裹、--- 之前有問候語或說明文字。
 * 依次嘗試（原文／去圍欄／自第一個 --- 行起），第一個能通過完整校驗者勝出；全敗回 null（fail-closed）。
 */
export function normalizeReport(raw: string): string | null {
  const candidates: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !candidates.includes(t)) candidates.push(t);
  };
  push(raw);
  const stripped = raw
    .trim()
    .replace(/^```[a-zA-Z]*\s*\r?\n?/, "")
    .replace(/\r?\n?```\s*$/, "");
  push(stripped);
  for (const base of [raw, stripped]) {
    const lines = base.split(/\r?\n/);
    const idx = lines.findIndex((l) => l.trim() === "---");
    if (idx > 0) {
      push(lines.slice(idx).join("\n").replace(/\r?\n?```\s*$/, ""));
    }
  }
  for (const c of candidates) {
    if (!c.startsWith("---")) continue;
    try {
      parseReport(c);
      return c;
    } catch {
      // 試下一個候選
    }
  }
  return null;
}

export type RouteAction =
  | "to_viewer"
  | "to_tester"
  | "back_to_coder"
  | "delivered"
  | "circuit_break";

/** 純路由函式：verdict 驅動流向；雙門檻（tester pass ＋ 當輪 viewer approve）才交付；達 max_iterations 熔斷 */
export function route(
  role: PipelineRole,
  verdict: Verdict,
  iteration: number,
  maxIterations: number,
  viewerApproved: boolean,
): RouteAction {
  if (role === "coder") return "to_viewer";
  if (role === "viewer") {
    if (verdict === "approve") return "to_tester";
    return iteration >= maxIterations ? "circuit_break" : "back_to_coder";
  }
  if (verdict === "pass" && viewerApproved) return "delivered";
  return iteration >= maxIterations ? "circuit_break" : "back_to_coder";
}

export interface PipelineStep {
  role: PipelineRole;
  iteration: number;
  verdict: Verdict;
  file: string;
  action: RouteAction;
}

export interface PipelineResult {
  status: "delivered" | "circuit_break";
  steps: PipelineStep[];
  /** 本次任務的沙箱（--sandbox 時存在）；merge/prune 由老闆決定 */
  sandbox?: SandboxInfo;
}

export interface ReportPipelineOptions {
  seats: SeatsConfig;
  /** mock 模式免 API key：用內建模擬報告跑通全鏈 */
  mock?: boolean;
  registry?: ProviderRegistry;
  agentsDir?: string;
  reportsDir?: string;
  /** 覆寫 seats.yaml 的 pipeline.max_iterations（熔斷上限） */
  maxIterations?: number;
  /** 報告檔名署名；預設 mock 為 "mock"，real 為 "pipeline" */
  signature?: string;
  /** P2 沙箱：git worktree 練習房＋檔案手（coder 可寫、viewer/tester 唯讀） */
  sandbox?: boolean;
  repoRoot?: string;
  /** 行動權限門：ask|semi|auto；非互動批次建議 auto */
  approval?: { mode: ApprovalMode; ask?: AskFn };
  /** 中途取消（ESC）——貫通所有 LLM 呼叫 */
  signal?: AbortSignal;
  log?: (line: string) => void;
}

export class ReportPipeline {
  private readonly seats: SeatsConfig;
  private readonly mock: boolean;
  private readonly registry?: ProviderRegistry;
  private readonly agentsDir: string;
  private readonly reportsDir: string;
  private readonly maxIterations: number;
  private readonly signature: string;
  private readonly log: (line: string) => void;
  private readonly agents = new Map<PipelineRole, BaseAgent>();
  private readonly useSandbox: boolean;
  private readonly repoRoot: string;
  private readonly approval?: { mode: ApprovalMode; ask?: AskFn };
  private readonly signal?: AbortSignal;
  private sandboxInfo?: SandboxInfo;

  constructor(opts: ReportPipelineOptions) {
    if (opts.seats.pipeline.mode !== "report_chain") {
      throw new Error(t("unsupportedMode", { mode: opts.seats.pipeline.mode }));
    }
    for (const role of ROLES) {
      if (!opts.seats.seats[role]) {
        throw new Error(t("missingSeat", { role }));
      }
    }
    this.seats = opts.seats;
    this.mock = opts.mock ?? false;
    this.registry = opts.registry;
    this.agentsDir = opts.agentsDir ?? "agents";
    this.reportsDir = opts.reportsDir ?? "reports/pipeline";
    this.maxIterations =
      opts.maxIterations ?? this.seats.pipeline.max_iterations;
    if (!Number.isInteger(this.maxIterations) || this.maxIterations < 1) {
      throw new Error(t("maxIterInvalid", { value: this.maxIterations }));
    }
    this.signature = opts.signature ?? (this.mock ? "mock" : "pipeline");
    this.useSandbox = opts.sandbox ?? false;
    this.repoRoot = opts.repoRoot ?? process.cwd();
    this.approval = opts.approval;
    this.signal = opts.signal;
    this.log = opts.log ?? (() => {});
    if (!this.mock && !this.registry) {
      throw new Error(t("needRegistry"));
    }
  }

  async run(task: string): Promise<PipelineResult> {
    this.validateRoleFiles();
    if (!this.mock) this.validateProviders();
    if (this.useSandbox) {
      const slug =
        task.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 16) ||
        "task";
      this.sandboxInfo = createSandbox(this.repoRoot, slug);
      this.log(
        t("sandboxCreated", {
          id: this.sandboxInfo.id,
          branch: this.sandboxInfo.branch,
          dir: this.sandboxInfo.dir,
        }),
      );
    }

    const max = this.maxIterations;
    let iteration = 1;
    let role: PipelineRole = "coder";
    let upstream = `任務：${task}`;
    let viewerApproved = false;
    let lastCoderFile = "";
    let lastViewerFile = "";
    const steps: PipelineStep[] = [];

    this.log(t("logStart", { mode: "report_chain", max, mock: String(this.mock) }));

    for (;;) {
      const produced = await this.produce(role, iteration, task, upstream, lastCoderFile, lastViewerFile);
      const action = route(role, produced.fm.verdict, iteration, max, viewerApproved);
      steps.push({ role, iteration, verdict: produced.fm.verdict, file: basename(produced.file), action });
      this.log(
        t("logStep", {
          role,
          n: iteration,
          verdict: produced.fm.verdict,
          action,
          file: basename(produced.file),
        }),
      );

      if (role === "coder") lastCoderFile = produced.file;
      if (role === "viewer") {
        lastViewerFile = produced.file;
        if (produced.fm.verdict === "approve") viewerApproved = true;
      }
      upstream = `${upstream}\n\n=== ${basename(produced.file)} ===\n${produced.body}`;

      if (action === "delivered") {
        return {
          status: "delivered",
          steps,
          ...(this.sandboxInfo ? { sandbox: this.sandboxInfo } : {}),
        };
      }
      if (action === "circuit_break") {
        this.log(t("logCircuitBreak", { max }));
        return {
          status: "circuit_break",
          steps,
          ...(this.sandboxInfo ? { sandbox: this.sandboxInfo } : {}),
        };
      }
      if (action === "to_viewer") role = "viewer";
      else if (action === "to_tester") role = "tester";
      else {
        role = "coder";
        iteration += 1;
        viewerApproved = false;
        upstream = `${upstream}\n\n${t("upstreamRejected", { n: iteration })}`;
      }
    }
  }

  /** 啟動前校驗三份角色定義檔：frontmatter role 一致＋verdict 鎖 na（frontmatter 的第一個程式碼消費者） */
  private validateRoleFiles(): void {
    for (const role of ROLES) {
      const parsed = parseRoleMarkdown(this.roleFileRaw(role), role);
      const fm = parsed.frontmatter;
      if (!fm || fm.role !== role || fm.verdict !== "na") {
        throw new Error(t("roleFileInvalid", { role }));
      }
    }
  }

  private validateProviders(): void {
    for (const role of ROLES) {
      const seat = this.seats.seats[role] as SeatConfig;
      if (!this.providerFor(seat)) {
        throw new Error(t("providerNoKey", { provider: seat.provider }));
      }
    }
  }

  /** 席位帶 base_url 時走自建相容供應商，否則用 registry 查表 */
  private providerFor(seat: SeatConfig) {
    return seat.base_url
      ? createProvider(seat.provider, undefined, seat.base_url)
      : this.registry?.get(seat.provider);
  }

  private agent(role: PipelineRole): BaseAgent {
    const cached = this.agents.get(role);
    if (cached) return cached;
    const seat = this.seats.seats[role] as SeatConfig;
    const provider = this.providerFor(seat);
    if (!provider) {
      throw new Error(t("providerNoKeyShort", { provider: seat.provider }));
    }
    const built = new BaseAgent({
      name: role,
      role: parseRoleMarkdown(this.roleFileRaw(role), role),
      seat,
      provider,
    });
    this.agents.set(role, built);
    return built;
  }

  private roleFileRaw(role: PipelineRole): string {
    const seat = this.seats.seats[role] as SeatConfig;
    const path = seat.system_prompt_file
      ? resolve(seat.system_prompt_file)
      : resolve(this.agentsDir, `${role}.md`);
    return readFileSync(resolveRoleFile(path), "utf-8");
  }

  private async produce(
    role: PipelineRole,
    iteration: number,
    task: string,
    upstream: string,
    coderFile: string,
    viewerFile: string,
  ): Promise<{ fm: ReportFrontmatter; body: string; file: string }> {
    const sandboxCtx = this.sandboxInfo
      ? `\n\n== 沙箱現況（${this.sandboxInfo.id}）==\n${sandboxDiff(this.repoRoot, this.sandboxInfo.id)}`
      : "";
    const raw = this.mock
      ? mockReport(role, iteration, task, coderFile, viewerFile)
      : await this.produceReal(role, iteration, upstream, sandboxCtx);
    const md = this.mock ? raw : (normalizeReport(raw) ?? raw);
    let parsed: { fm: ReportFrontmatter; body: string };
    try {
      parsed = parseReport(md);
    } catch (e) {
      throw new Error(
        `${(e as Error).message}${t("replyHead", { head: JSON.stringify(raw.slice(0, 120)) })}`,
      );
    }
    const { fm, body } = parsed;
    if (this.sandboxInfo && role === "coder") {
      if (this.mock) {
        const tools = makeFileTools({ sandboxDir: this.sandboxInfo.dir });
        tools.write("mock-deliverable.txt", `mock deliverable for: ${task}`);
      }
      sandboxCheckpoint(this.repoRoot, this.sandboxInfo.id, `coder-it${iteration}`);
    }
    if (fm.role !== role) {
      throw new Error(t("roleMismatch", { got: fm.role, want: role }));
    }
    if (fm.iteration !== iteration) {
      throw new Error(t("iterMismatch", { got: fm.iteration, want: iteration }));
    }
    const file = this.writeReport(role, iteration, task, fm, body);
    return { fm, body, file };
  }

  /** real 模式產出：沙箱開啟時走工具循環（coder 寫手／viewer·tester 唯讀），否則單發 */
  private async produceReal(
    role: PipelineRole,
    iteration: number,
    upstream: string,
    sandboxCtx: string,
  ): Promise<string> {
    const agent = this.agent(role);
    const instruction = t("reportInstruction", {
      role,
      iteration,
      domain: VERDICT_DOMAINS[role].join("/"),
    });
    const content = `${upstream}${sandboxCtx}\n\n${instruction}`;
    if (!this.sandboxInfo) {
      return agent.speak([{ role: "user", content }], this.signal);
    }

    const file = makeFileTools({
      sandboxDir: this.sandboxInfo.dir,
      repoRoot: this.repoRoot,
    });
    // 權限矩陣（紅線程式化）：
    //   coder：寫+跑，依 approval 門（批次預設 auto）
    //   tester：禁寫、可跑測試（跑的門隨 approval）
    //   viewer：禁寫禁跑（唯讀審查）
    const base = this.approval;
    const gate = (() => {
      if (role === "coder") return new ApprovalGate(base ?? { mode: "auto" });
      if (role === "tester") {
        const filterAsk = base?.ask
          ? async (req: { op: import("../tools/approval").ApprovalRequest["op"]; detail: string }) =>
              req.op === "write_file" ? ("no" as const) : base.ask!(req)
          : async () => "no" as const;
        return new ApprovalGate(
          base?.mode === "auto"
            ? { mode: "auto", ask: filterAsk }
            : { mode: "semi", ask: filterAsk },
        );
      }
      return new ApprovalGate({ mode: "semi", ask: async () => "no" });
    })();
    return runAgentLoop(agent, {
      initialUser: `${content}\n\n${t("toolSpec")}`,
      file,
      gate,
      signal: this.signal,
      runCwd: this.sandboxInfo.dir,
      onTool: (desc) => this.log(`  🔧 ${desc}`),
    });
  }

  private writeReport(
    role: PipelineRole,
    iteration: number,
    task: string,
    fm: ReportFrontmatter,
    body: string,
  ): string {
    mkdirSync(this.reportsDir, { recursive: true });
    const slug = task.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "task";
    const file = resolve(
      this.reportsDir,
      `${role}_${String(iteration).padStart(2, "0")}_${slug}_${this.signature}.md`,
    );
    writeFileSync(file, `---\n${stringify(fm)}---\n\n${body}\n`, "utf-8");
    return file;
  }
}

/** mock 模式：確定性模擬報告（viewer 第一次退回以示範退回路由，第二次放行） */
function mockReport(
  role: PipelineRole,
  iteration: number,
  task: string,
  coderFile: string,
  viewerFile: string,
): string {
  if (role === "coder") {
    return `---
role: coder
iteration: ${iteration}
depends_on: [${viewerFile ? JSON.stringify(basename(viewerFile)) : ""}]
target_files: ["src/example.ts"]
verdict: na
---

# Coder 實作報告（mock）

## 做了什麼
- 針對任務「${task}」完成模擬實作（mock 模式，未呼叫真實 LLM）
- 改動清單：\`src/example.ts\`（示範用虛構路徑）

## 實測結果
（模擬環境：typecheck exit 0）

## 交接
請 Viewer 審查本報告，產 viewer 報告。
`;
  }
  if (role === "viewer") {
    if (iteration === 1) {
      return `---
role: viewer
iteration: ${iteration}
depends_on: ["${coderFile ? basename(coderFile) : ""}"]
target_files: ["src/example.ts"]
verdict: request_changes
---

# Viewer 審查報告（mock）

## 審查概述
- 審查對象：${coderFile ? basename(coderFile) : "（無）"}

## 風險清單
1. mock 演練：第一次審查一律退回，以示範 request_changes → 退回 Coder 路由。

## 修改建議
- 請 Coder 依風險清單補充說明後重交（iteration +1）。
`;
    }
    return `---
role: viewer
iteration: ${iteration}
depends_on: ["${coderFile ? basename(coderFile) : ""}"]
target_files: ["src/example.ts"]
verdict: approve
---

# Viewer 審查報告（mock）

## 審查概述
- 審查對象：${coderFile ? basename(coderFile) : "（無）"}

## 風險清單
1. 無阻塞風險（mock 第二次審查放行）。

## 審查結論
verdict: approve，移交 Tester 驗收。
`;
  }
  return `---
role: tester
iteration: ${iteration}
depends_on: ["${coderFile ? basename(coderFile) : ""}", "${viewerFile ? basename(viewerFile) : ""}"]
target_files: ["src/example.ts"]
verdict: pass
---

# Tester 驗收報告（mock）

## 實測記錄（模擬數字，非真實環境）
- 測試案例：3/3 通過（模擬）
- 覆蓋率：100%（模擬）

## 判定
verdict: pass — 雙門檻（viewer approve ＋ tester pass）齊備，准許交付。
`;
}
