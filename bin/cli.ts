#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRegistry } from "../src/llm/factory";
import { loadSeats } from "../src/agent/seat-loader";
import { ReportPipeline } from "../src/pipeline/report-pipeline";

// Khuimeng 報告管道 CLI
//   npm start -- "任務"                    real 模式（三席位各需對應 API key）
//   npm start -- --mock "任務"             mock 模式（免 API key，模擬報告跑通全鏈）
//   npm start -- -f 任務書.md --mock       任務書從檔案讀入
//
// Exit codes: 0=delivered（雙門檻通過）｜1=circuit_break（熔斷轉人工）｜2=使用錯誤或校驗失敗

const VERSION = "0.1.0";

const HELP = `Khuimeng 報告管道 CLI v${VERSION}

用法：
  khuimeng [旗標] "任務"            real 模式執行任務
  khuimeng --mock "任務"            mock 模式（免 API key）

旗標：
  --mock, --dry-run          mock 模式，以內建模擬報告跑通全鏈
  -f, --task-file <路徑>      任務書從檔案讀入（之後的位置參數忽略）
  --max-iterations <N>       覆寫熔斷上限（預設讀 seats.yaml，當前 3）
  --reports-dir <路徑>        報告輸出目錄（預設 reports/pipeline）
  --signature <名稱>          報告檔名署名（預設 mock 模式 "mock"、real 模式 "pipeline"）
  --json                     只輸出機器可讀 JSON（抑制過程 log）
  --version                  顯示版本
  -h, --help                 顯示本說明

Exit codes: 0=delivered｜1=circuit_break（熔斷轉人工）｜2=使用錯誤或校驗失敗`;

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

const parsed = parseArgs(process.argv.slice(2));
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
