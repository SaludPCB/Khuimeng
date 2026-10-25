/**
 * 行動權限門（ask | semi | auto）：
 *   ask  — 一切工具呼叫都要老闆點頭（讀也問）
 *   semi — 讀/列自動放行；寫入才問
 *   auto — 全自動（仍在沙箱圍欄內，爆炸半徑有限）
 * 問詢回應：yes（這次）| always（本 session 同類永放）| no（拒絕）
 */

export type ApprovalMode = "ask" | "semi" | "auto";

export type ApprovalOp = "write_file" | "read_file" | "list_files" | "run_command";

export interface ApprovalRequest {
  op: ApprovalOp;
  /** 人類可讀描述，如 write_file cube.html（1.2KB） */
  detail: string;
}

export type AskFn = (req: ApprovalRequest) => Promise<"yes" | "always" | "no">;

export interface ApprovalGateOptions {
  mode: ApprovalMode;
  /** ask/semi 需要互動詢問；未提供時 fail-closed（拒絕寫入） */
  ask?: AskFn;
}

/** semi 模式下需要詢問的操作（寫入與指令執行） */
const WRITE_OPS: ReadonlySet<ApprovalOp> = new Set(["write_file", "run_command"]);

export class ApprovalGate {
  private readonly mode: ApprovalMode;
  private readonly ask?: AskFn;
  private readonly always = new Set<ApprovalOp>();

  constructor(opts: ApprovalGateOptions) {
    this.mode = opts.mode;
    this.ask = opts.ask;
  }

  getMode(): ApprovalMode {
    return this.mode;
  }

  async decide(req: ApprovalRequest): Promise<boolean> {
    if (this.mode === "auto") return true;
    if (this.always.has(req.op)) return true;
    const needAsk =
      this.mode === "ask" || (this.mode === "semi" && WRITE_OPS.has(req.op));
    if (!needAsk) return true;
    if (!this.ask) {
      // 非互動環境（批次）下 ask/semi 的寫入：fail-closed 拒絕
      return false;
    }
    const answer = await this.ask(req);
    if (answer === "always") {
      this.always.add(req.op);
      return true;
    }
    return answer === "yes";
  }
}
