import type { BaseAgent } from "../agent/base-agent";
import type { ApprovalGate, ApprovalOp } from "./approval";
import type { FileTools } from "./file-tools";

/**
 * 代理工具循環：LLM 以純文字工具協定呼叫檔案手，引擎執行→回饋→續跑，直到最終報告。
 * 協定（不依賴 function-calling，任何模型可用）：
 *   <<<TOOL write_file path=cube.html
 *   …完整檔案內容…
 *   TOOL>>>
 *   <<<TOOL read_file path=src/index.ts
 *   TOOL>>>
 *   <<<TOOL list_files path=.
 *   TOOL>>>
 */

export interface ToolCall {
  op: ApprovalOp;
  path: string;
  content: string;
}

export interface AgentLoopOptions {
  /** 第一棒 user 訊息（含工具規格說明） */
  initialUser: string;
  /** 檔案手（寫手或唯讀版由呼叫端組裝） */
  file: FileTools;
  gate: ApprovalGate;
  maxSteps?: number;
  /** 工具事件旁聽（log 用） */
  onTool?: (desc: string) => void;
}

/** 解析回覆中的工具區塊（純函式） */
export function parseToolBlocks(reply: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const re = /<<<TOOL (\w+)(?:\s+path=([^\s>]+))?\s*\r?\n([\s\S]*?)\r?\n?TOOL>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply)) !== null) {
    const op = m[1] as ApprovalOp;
    if (op !== "write_file" && op !== "read_file" && op !== "list_files") continue;
    calls.push({ op, path: m[2] ?? ".", content: (m[3] ?? "").trim() });
  }
  return calls;
}

function runTool(
  call: ToolCall,
  file: FileTools,
  gate: ApprovalGate,
  onTool?: (desc: string) => void,
): Promise<string> {
  return (async () => {
    const detail = `${call.op} ${call.path}`;
    onTool?.(detail);
    const allowed = await gate.decide({ op: call.op, detail });
    if (!allowed) return `已拒絕（權限模式未允許 ${call.op}）`;
    try {
      switch (call.op) {
        case "write_file": {
          if (!call.path || call.path === ".") return "錯誤：write_file 需要 path";
          const r = file.write(call.path, `${call.content}\n`);
          return `ok：已寫入 ${r.path}（${r.bytes} bytes）`;
        }
        case "read_file":
          return file.read(call.path);
        case "list_files":
          return file.list(call.path || ".");
      }
    } catch (e) {
      return `錯誤：${(e as Error).message}`;
    }
  })();
}

/**
 * 跑代理循環：回覆含工具區塊→執行→結果以 user 訊息回饋→再問；
 * 不含工具區塊＝最終答案（應為 --- frontmatter 報告），原樣返回。
 */
export async function runAgentLoop(
  agent: BaseAgent,
  opts: AgentLoopOptions,
): Promise<string> {
  const maxSteps = opts.maxSteps ?? 12;
  const transcript: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: opts.initialUser },
  ];
  let used = 0;

  for (;;) {
    const reply = await agent.speak(transcript);
    const calls = parseToolBlocks(reply);
    if (calls.length === 0) return reply;
    transcript.push({ role: "assistant", content: reply });
    const results: string[] = [];
    for (const call of calls) {
      used += 1;
      if (used > maxSteps) {
        throw new Error(`工具呼叫超過上限 ${maxSteps}（防失控熔斷）`);
      }
      results.push(await runTool(call, opts.file, opts.gate, opts.onTool));
    }
    transcript.push({
      role: "user",
      content:
        `工具執行結果：\n${results.join("\n---\n")}\n\n` +
        `請依結果繼續（可再呼叫工具）。全部完成後，輸出最終報告：第 1 行必須是 ---（不得再有任何工具區塊）。`,
    });
  }
}
