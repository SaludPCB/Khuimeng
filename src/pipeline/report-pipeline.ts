import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse, stringify } from "yaml";
import type { ProviderRegistry } from "../llm/factory";
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
    return { ok: false, errors: ["frontmatter 不是物件"] };
  }
  const fm = input as Record<string, unknown>;
  const errors: string[] = [];
  const role = fm.role as PipelineRole;
  if (!ROLES.includes(role)) {
    errors.push(`role 非法: ${String(fm.role)}`);
  } else if (!VERDICT_DOMAINS[role].includes(fm.verdict as Verdict)) {
    errors.push(
      `verdict "${String(fm.verdict)}" 不在 ${role} 值域 [${VERDICT_DOMAINS[role].join("/")}]`,
    );
  }
  if (
    typeof fm.iteration !== "number" ||
    !Number.isInteger(fm.iteration) ||
    fm.iteration < 1
  ) {
    errors.push(`iteration 須為正整數，實際: ${String(fm.iteration)}`);
  }
  for (const key of ["depends_on", "target_files"] as const) {
    if (!Array.isArray(fm[key])) errors.push(`${key} 須為陣列`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, fm: fm as unknown as ReportFrontmatter };
}

/** 自 Markdown 文本解析 --- 圍欄 frontmatter ＋本文 */
export function parseReport(md: string): { fm: ReportFrontmatter; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!m || m[1] === undefined) {
    throw new Error("報告缺少 --- frontmatter 圍欄");
  }
  const v = validateFrontmatter(parse(m[1]));
  if (!v.ok) {
    throw new Error(`frontmatter 校驗失敗: ${v.errors.join("；")}`);
  }
  return { fm: v.fm, body: m[2] ?? "" };
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

  constructor(opts: ReportPipelineOptions) {
    if (opts.seats.pipeline.mode !== "report_chain") {
      throw new Error(`不支援的 pipeline.mode: ${opts.seats.pipeline.mode}`);
    }
    for (const role of ROLES) {
      if (!opts.seats.seats[role]) {
        throw new Error(`seats.yaml 缺少角色座席: ${role}`);
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
      throw new Error(`max_iterations 須為正整數，實際: ${this.maxIterations}`);
    }
    this.signature = opts.signature ?? (this.mock ? "mock" : "pipeline");
    this.log = opts.log ?? (() => {});
    if (!this.mock && !this.registry) {
      throw new Error("real 模式需要 registry（或改用 mock: true）");
    }
  }

  async run(task: string): Promise<PipelineResult> {
    this.validateRoleFiles();
    if (!this.mock) this.validateProviders();

    const max = this.maxIterations;
    let iteration = 1;
    let role: PipelineRole = "coder";
    let upstream = `任務：${task}`;
    let viewerApproved = false;
    let lastCoderFile = "";
    let lastViewerFile = "";
    const steps: PipelineStep[] = [];

    this.log(
      `▶ 管道啟動（mode=report_chain, max_iterations=${max}, mock=${this.mock}）`,
    );

    for (;;) {
      const produced = await this.produce(role, iteration, task, upstream, lastCoderFile, lastViewerFile);
      const action = route(role, produced.fm.verdict, iteration, max, viewerApproved);
      steps.push({ role, iteration, verdict: produced.fm.verdict, file: basename(produced.file), action });
      this.log(
        `  [${role} #${iteration}] verdict=${produced.fm.verdict} → ${action}（${basename(produced.file)}）`,
      );

      if (role === "coder") lastCoderFile = produced.file;
      if (role === "viewer") {
        lastViewerFile = produced.file;
        if (produced.fm.verdict === "approve") viewerApproved = true;
      }
      upstream = `${upstream}\n\n=== ${basename(produced.file)} ===\n${produced.body}`;

      if (action === "delivered") return { status: "delivered", steps };
      if (action === "circuit_break") {
        this.log(`⛔ 熔斷：退回次數達上限（${max}），轉人工裁決。`);
        return { status: "circuit_break", steps };
      }
      if (action === "to_viewer") role = "viewer";
      else if (action === "to_tester") role = "tester";
      else {
        role = "coder";
        iteration += 1;
        viewerApproved = false;
        upstream = `${upstream}\n\n（上一輪被退回，請依 Viewer／Tester 意見修改後重交，iteration=${iteration}）`;
      }
    }
  }

  /** 啟動前校驗三份角色定義檔：frontmatter role 一致＋verdict 鎖 na（frontmatter 的第一個程式碼消費者） */
  private validateRoleFiles(): void {
    for (const role of ROLES) {
      const parsed = parseRoleMarkdown(this.roleFileRaw(role), role);
      const fm = parsed.frontmatter;
      if (!fm || fm.role !== role || fm.verdict !== "na") {
        throw new Error(
          `角色檢查失敗：${role} 定義檔 frontmatter 須 role=${role}、verdict=na`,
        );
      }
    }
  }

  private validateProviders(): void {
    for (const role of ROLES) {
      const seat = this.seats.seats[role] as SeatConfig;
      if (!this.registry?.get(seat.provider)) {
        throw new Error(
          `供應商 ${seat.provider} 未設定 API key（請設定環境變數）或改用 --mock`,
        );
      }
    }
  }

  private agent(role: PipelineRole): BaseAgent {
    const cached = this.agents.get(role);
    if (cached) return cached;
    const seat = this.seats.seats[role] as SeatConfig;
    const provider = this.registry!.get(seat.provider)!;
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
    return readFileSync(path, "utf-8");
  }

  private async produce(
    role: PipelineRole,
    iteration: number,
    task: string,
    upstream: string,
    coderFile: string,
    viewerFile: string,
  ): Promise<{ fm: ReportFrontmatter; body: string; file: string }> {
    const md = this.mock
      ? mockReport(role, iteration, task, coderFile, viewerFile)
      : await this.agent(role).speak([
          {
            role: "user",
            content:
              `${upstream}\n\n請依你的角色定義輸出 Markdown 報告：檔頭須有 --- 圍欄 YAML frontmatter（role: ${role}, iteration: ${iteration}, depends_on, target_files, verdict），verdict 須落在你的值域 [${VERDICT_DOMAINS[role].join("/")}]。`,
          },
        ]);
    const { fm, body } = parseReport(md);
    if (fm.role !== role) {
      throw new Error(`報告 role=${fm.role} 與預期 ${role} 不符`);
    }
    if (fm.iteration !== iteration) {
      throw new Error(`報告 iteration=${fm.iteration} 與預期 ${iteration} 不符`);
    }
    const file = this.writeReport(role, iteration, task, fm, body);
    return { fm, body, file };
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
