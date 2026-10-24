#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRegistry } from "../src/llm/factory";
import { loadSeats } from "../src/agent/seat-loader";
import { ReportPipeline, ROLES, type PipelineRole } from "../src/pipeline/report-pipeline";
import { runWatcher } from "../src/pipeline/watcher";

// Khuimeng 報告管道 CLI
//   npm start -- "任務"                    real 模式（三席位各需對應 API key）
//   npm start -- --mock "任務"             mock 模式（免 API key，模擬報告跑通全鏈）
//   npm start -- -f 任務書.md --mock       任務書從檔案讀入
//   npm start -- watch coder|viewer|tester 三視窗觀測（各開一個終端機）
//
// Exit codes: 0=delivered（雙門檻通過）｜1=circuit_break（熔斷轉人工）｜2=使用錯誤或校驗失敗

const VERSION = "0.1.0";

const HELP = `Khuimeng 報告管道 CLI v${VERSION}

用法：
  khuimeng [旗標] "任務"            執行任務（real 模式）
  khuimeng --mock "任務"            mock 模式（免 API key）
  khuimeng watch <角色> [旗標]      觀測面板：即時盯某角色的報告產出

watch 角色：coder | viewer | tester（開三個終端機視窗各跑一個，即是三視窗觀測）
watch 旗標：--reports-dir <路徑>（同跑任務的目錄）、--match <關鍵字>（只盯某任務）、--once（渲染一次即退出）
watch 語義：啟動時進入待命（舊報告只在「上次」一行帶過）；啟動後新落盤的報告才會上屏

旗標：
  --mock, --dry-run          mock 模式，以內建模擬報告跑通全鏈
  -f, --task-file <路徑>      任務書從檔案讀入（之後的位置參數忽略）
  --max-iterations <N>       覆寫熔斷上限（預設讀 seats.yaml，當前 3）
  --reports-dir <路徑>        報告輸出目錄（預設 reports/pipeline）
  --signature <名稱>          報告檔名署名（預設 mock 模式 "mock"、real 模式 "pipeline"）
  --json                     只輸出機器可讀 JSON（抑制過程 log）
  --version                  顯示版本
  -h, --help                 顯示本說明

三視窗示例（四個終端機）：
  npm start -- watch coder
  npm start -- watch viewer
  npm start -- watch tester
  npm start -- --mock "你的任務"     # 或 real 模式（設 NVIDIA_API_KEY）

Exit codes: 0=delivered｜1=circuit_break（熔斷轉人工）｜2=使用錯誤或校驗失敗`;

// ── watch 子命令 ──────────────────────────────────────────────

function runWatchCommand(argv: string[]): number {
  let role = "";
  let reportsDir = "reports/pipeline";
  let once = false;
  let match: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--reports-dir") {
      const next = argv[++i];
      if (!next) {
        console.error("錯誤: --reports-dir 需要目錄路徑");
        return 2;
      }
      reportsDir = next;
    } else if (a === "--match") {
      const next = argv[++i];
      if (!next) {
        console.error("錯誤: --match 需要關鍵字（任務 slug）");
        return 2;
      }
      match = next;
    } else if (a === "--once") {
      once = true;
    } else if (!a.startsWith("-")) {
      if (role) {
        console.error(`錯誤: 多餘參數 ${a}（watch 只吃一個角色）`);
        return 2;
      }
      role = a;
    } else {
      console.error(`錯誤: watch 不支援旗標 ${a}`);
      return 2;
    }
  }
  if (!ROLES.includes(role as PipelineRole)) {
    console.error(`錯誤: watch 角色須為 coder|viewer|tester，實際: ${role || "（未提供）"}`);
    return 2;
  }
  runWatcher(role as PipelineRole, resolve(reportsDir), {
    once,
    match,
    write: (panel) => {
      process.stdout.write(`\x1B[2J\x1B[H${panel}\n`);
    },
  });
  return 0;
}

// ── 主命令：跑管道 ────────────────────────────────────────────

interface CliArgs {
  mock: boolean;
  topic: string;
  taskFile?: string;
  maxIterations?: number;
  reportsDir?: string;
  signature?: string;
  json: boolean;
}

function parseArgs(argv: string[]): { ok: true; args: CliArgs } | { ok: false; message: string } {
  const args: CliArgs = { mock: false, topic: "", json: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    switch (a) {
      case "--mock":
      case "--dry-run":
        args.mock = true;
        break;
      case "-f":
      case "--task-file": {
        if (!next) return { ok: false, message: `${a} 需要檔案路徑` };
        args.taskFile = next;
        i++;
        break;
      }
      case "--max-iterations": {
        const n = Number(next);
        if (!next || !Number.isInteger(n) || n < 1) {
          return { ok: false, message: `${a} 需要正整數，實際: ${String(next)}` };
        }
        args.maxIterations = n;
        i++;
        break;
      }
      case "--reports-dir": {
        if (!next) return { ok: false, message: `${a} 需要目錄路徑` };
        args.reportsDir = next;
        i++;
        break;
      }
      case "--signature": {
        if (!next) return { ok: false, message: `${a} 需要署名` };
        args.signature = next;
        i++;
        break;
      }
      case "--json":
        args.json = true;
        break;
      case "--version":
        console.log(VERSION);
        process.exit(0);
      case "-h":
      case "--help":
        console.log(HELP);
        process.exit(0);
      default:
        if (a.startsWith("-")) return { ok: false, message: `未知旗標: ${a}（--help 看說明）` };
        positional.push(a);
    }
  }
  if (args.taskFile) {
    try {
      args.topic = readFileSync(resolve(args.taskFile), "utf-8").trim();
    } catch {
      return { ok: false, message: `任務書讀取失敗: ${args.taskFile}` };
    }
    if (!args.topic) return { ok: false, message: `任務書為空: ${args.taskFile}` };
  } else {
    args.topic = positional.join(" ");
  }
  if (!args.topic) args.topic = "AI 是否會取代軟體工程師？";
  return { ok: true, args };
}

async function runMain(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(`錯誤: ${parsed.message}`);
    process.exit(2);
  }
  const { args } = parsed;

  const root = resolve(import.meta.dirname, "..");
  const seats = loadSeats(resolve(root, "configs/seats.yaml"));
  const registry = args.mock ? undefined : createRegistry();

  const logs: string[] = [];
  const log = (line: string) => {
    if (args.json) logs.push(line);
    else console.log(line);
  };

  if (!args.json) {
    console.log(
      `Khuimeng 報告管道 v${VERSION} | 模式: ${args.mock ? "mock（免 API key）" : "real"} | 議題: ${args.topic}`,
    );
  }

  const pipeline = new ReportPipeline({
    seats,
    registry,
    mock: args.mock,
    agentsDir: resolve(root, "agents"),
    reportsDir: args.reportsDir
      ? resolve(args.reportsDir)
      : resolve(root, "reports/pipeline"),
    maxIterations: args.maxIterations,
    signature: args.signature,
    log,
  });

  try {
    const result = await pipeline.run(args.topic);

    if (args.json) {
      console.log(
        JSON.stringify(
          { version: VERSION, mode: args.mock ? "mock" : "real", topic: args.topic, ...result, logs },
          null,
          2,
        ),
      );
    } else if (result.status === "delivered") {
      console.log("✅ 雙門檻通過（viewer approve ＋ tester pass），任務交付。");
    } else {
      console.log("⛔ 熔斷：轉人工裁決。");
    }
    process.exitCode = result.status === "delivered" ? 0 : 1;
  } catch (e) {
    if (args.json) {
      console.log(JSON.stringify({ error: (e as Error).message, logs }, null, 2));
    } else {
      console.error(`⛔ 執行失敗：${(e as Error).message}`);
    }
    process.exitCode = 2;
  }
}

// ── 分派 ─────────────────────────────────────────────────────

const argv = process.argv.slice(2);
if (argv[0] === "watch") {
  const code = runWatchCommand(argv.slice(1));
  // 失敗立即退出；成功交還事件迴圈——
  // once 模式渲染完自然結束，連續模式由 setInterval 保持存活（嚴禁 process.exit 打斷輪詢）
  if (code !== 0) process.exit(code);
} else {
  await runMain(argv);
}
