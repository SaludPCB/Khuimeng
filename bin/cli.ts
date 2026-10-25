#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRegistry } from "../src/llm/factory";
import { loadSeats } from "../src/agent/seat-loader";
import { ReportPipeline, ROLES, type PipelineRole } from "../src/pipeline/report-pipeline";
import { runWatcher } from "../src/pipeline/watcher";
import { getLang, parseLang, setLang, t } from "../src/i18n";
import { loadEnvIfPresent } from "../src/dotenv-lite";

// 專案 .env 自動載入（已 export 的環境變數優先；無檔則安靜跳過）
loadEnvIfPresent(resolve(import.meta.dirname, "..", ".env"));
import {
  createSandbox,
  isGitRepo,
  listSandboxes,
  mergeSandbox,
  pruneSandbox,
  rollback,
  sandboxDiff,
} from "../src/tools/sandbox";

// Khuimeng 報告管道 CLI / Khuimeng report pipeline CLI
//   npm start -- "任務"                    real 模式
//   npm start -- --mock "任務"             mock 模式（免 API key）
//   npm start -- tui [--mock]              互動式 TUI
//   npm start -- watch coder|viewer|tester 三視窗觀測
//   --lang en | zh-TW                      介面語系（預設隨系統；KHUIMENG_LANG 亦可）
//
// Exit codes: 0=delivered | 1=circuit_break | 2=usage error / validation failure

const VERSION = "0.1.0";

// 早期掃描 --lang，讓 --help 與所有訊息即刻套用語系
const rawArgv = process.argv.slice(2);
for (let i = 0; i < rawArgv.length; i++) {
  if (rawArgv[i] === "--lang") {
    const v = rawArgv[i + 1];
    if (v) {
      const lang = parseLang(v);
      if (lang) setLang(lang);
      else {
        console.error(t("errPrefix", { msg: t("needLang") }));
        process.exit(2);
      }
      i++;
    }
  }
}

const HELP_ZH = `Khuimeng 報告管道 CLI v${VERSION}

用法：
  khuimeng tui [--mock]              互動式 TUI（跟 Coder 對話，/viewer /tester 召喚治理）
  khuimeng [旗標] "任務"              執行任務（real 模式）
  khuimeng --mock "任務"              mock 模式（免 API key）
  khuimeng watch <角色> [旗標]        觀測面板：即時盯某角色的報告產出\n  khuimeng sandbox [list|new|diff|merge|prune|rollback]  沙箱管理（git worktree）

watch 角色：coder | viewer | tester（開三個終端機視窗各跑一個，即是三視窗觀測）
watch 旗標：--reports-dir <路徑>、--match <關鍵字>（只盯某任務）、--once（渲染一次即退出）
watch 語義：啟動時進入待命（舊報告只在「上次」一行帶過）；啟動後新落盤的報告才會上屏

旗標：
  --mock, --dry-run          mock 模式，以內建模擬報告跑通全鏈
  -f, --task-file <路徑>      任務書從檔案讀入（之後的位置參數忽略）
  --max-iterations <N>       覆寫熔斷上限（預設讀 seats.yaml，當前 3）
  --reports-dir <路徑>        報告輸出目錄（預設 reports/pipeline）
  --signature <名稱>          報告檔名署名
  --lang en | zh-TW           介面語系（en 同時切換英文角色檔）
  --sandbox                  啟用沙箱＋檔案手（coder 真的寫檔；worktree 隔離）\n  --json                     只輸出機器可讀 JSON（抑制過程 log）
  --version                  顯示版本
  -h, --help                 顯示本說明

三視窗示例（四個終端機）：
  npm start -- watch coder
  npm start -- watch viewer
  npm start -- watch tester
  npm start -- --mock "你的任務"     # 或 real 模式（設 NVIDIA_API_KEY）

Exit codes: 0=delivered｜1=circuit_break（熔斷轉人工）｜2=使用錯誤或校驗失敗`;

const HELP_EN = `Khuimeng report pipeline CLI v${VERSION}

Usage:
  khuimeng tui [--mock]              Interactive TUI (chat with Coder; /viewer /tester summon governance)
  khuimeng [flags] "task"            Run a task (real mode)
  khuimeng --mock "task"             Mock mode (no API key)
  khuimeng watch <role> [flags]      Observation panel for one role's reports\n  khuimeng sandbox [list|new|diff|merge|prune|rollback]  Sandbox (git worktree) management

watch roles: coder | viewer | tester (three terminals = three-window observation)
watch flags: --reports-dir <path>, --match <keyword> (one task only), --once (render once and exit)
watch semantics: starts in standby (old reports shown as one "Last" line); only reports
                 written after launch are displayed

Flags:
  --mock, --dry-run          Mock mode with built-in simulated reports
  -f, --task-file <path>      Read the task from a file
  --max-iterations <N>       Override the circuit-breaker limit (seats.yaml default: 3)
  --reports-dir <path>        Report output directory (default reports/pipeline)
  --signature <name>          Report filename signature
  --lang en | zh-TW           UI language (en also switches English role files)
  --sandbox                  Enable sandbox + file tools (coder writes real files; worktree-isolated)\n  --json                     Machine-readable JSON output only
  --version                  Show version
  -h, --help                 Show this help

Three-window example (four terminals):
  npm start -- watch coder
  npm start -- watch viewer
  npm start -- watch tester
  npm start -- --mock "your task"    # or real mode (set NVIDIA_API_KEY)

Exit codes: 0=delivered | 1=circuit_break | 2=usage error / validation failure`;

function helpText(): string {
  return getLang() === "en" ? HELP_EN : HELP_ZH;
}

// ── watch 子命令 ──────────────────────────────────────────────

// ── sandbox 子命令 ────────────────────────────────────────────

function runSandboxCommand(argv: string[], repoRoot: string): number {
  const [sub, id] = argv;
  if (!isGitRepo(repoRoot)) {
    console.error(t("errPrefix", { msg: t("notGitRepo") }));
    return 2;
  }
  try {
    switch (sub ?? "list") {
      case "list": {
        const list = listSandboxes(repoRoot);
        if (list.length === 0) {
          console.log(t("worktreeNone"));
          return 0;
        }
        for (const sb of list) {
          console.log(
            t("worktreeLine", {
              id: sb.id,
              n: sb.checkpoints,
              dirty: sb.dirty ? t("worktreeDirty") : t("worktreeClean"),
            }),
          );
        }
        return 0;
      }
      case "new": {
        const sb = createSandbox(repoRoot);
        console.log(t("sandboxCreated", { id: sb.id, branch: sb.branch, dir: sb.dir }));
        return 0;
      }
      case "diff": {
        if (!id) {
          console.error(t("errPrefix", { msg: t("worktreeUsage") }));
          return 2;
        }
        console.log(sandboxDiff(repoRoot, id));
        return 0;
      }
      case "merge": {
        if (!id) {
          console.error(t("errPrefix", { msg: t("worktreeUsage") }));
          return 2;
        }
        console.log(t("worktreeMerged", { id }));
        mergeSandbox(repoRoot, id);
        return 0;
      }
      case "prune": {
        if (!id) {
          console.error(t("errPrefix", { msg: t("worktreeUsage") }));
          return 2;
        }
        pruneSandbox(repoRoot, id);
        console.log(t("worktreePruned", { id }));
        return 0;
      }
      case "rollback": {
        const n = Number(id ?? 1);
        const list = listSandboxes(repoRoot);
        const newest = list[0];
        if (!newest) {
          console.error(t("errPrefix", { msg: t("worktreeNone") }));
          return 2;
        }
        rollback(repoRoot, newest.id, Number.isInteger(n) && n > 0 ? n : 1);
        console.log(t("rollbackDone", { id: newest.id, n }));
        return 0;
      }
      default:
        console.error(t("errPrefix", { msg: t("worktreeUsage") }));
        return 2;
    }
  } catch (e) {
    console.error(t("errPrefix", { msg: (e as Error).message }));
    return 2;
  }
}

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
        console.error(t("errPrefix", { msg: t("needPath", { flag: a }) }));
        return 2;
      }
      reportsDir = next;
    } else if (a === "--lang") {
      const next = argv[++i];
      const lang = next ? parseLang(next) : null;
      if (!next || !lang) {
        console.error(t("errPrefix", { msg: t("needLang") }));
        return 2;
      }
      setLang(lang);
    } else if (a === "--match") {
      const next = argv[++i];
      if (!next) {
        console.error(t("errPrefix", { msg: t("needKeyword") }));
        return 2;
      }
      match = next;
    } else if (a === "--once") {
      once = true;
    } else if (!a.startsWith("-")) {
      if (role) {
        console.error(t("errPrefix", { msg: t("extraWatchArg", { arg: a }) }));
        return 2;
      }
      role = a;
    } else {
      console.error(t("errPrefix", { msg: t("watchNoFlag", { flag: a }) }));
      return 2;
    }
  }
  const normRole =
    role === "cai" ? "coder" : role === "vai" ? "viewer" : role === "tai" ? "tester" : role;
  if (!ROLES.includes(normRole as PipelineRole)) {
    console.error(
      t("errPrefix", {
        msg: t("watchRoleInvalid", { role: role || t("notProvided") }),
      }),
    );
    return 2;
  }
  runWatcher(normRole as PipelineRole, resolve(reportsDir), {
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
  sandbox?: boolean;
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
        if (!next) return { ok: false, message: t("needFile", { flag: a }) };
        args.taskFile = next;
        i++;
        break;
      }
      case "--lang": {
        const lang = next ? parseLang(next) : null;
        if (!next || !lang) return { ok: false, message: t("needLang") };
        setLang(lang);
        i++;
        break;
      }
      case "--max-iterations": {
        const n = Number(next);
        if (!next || !Number.isInteger(n) || n < 1) {
          return { ok: false, message: t("needPositiveInt", { flag: a, value: String(next) }) };
        }
        args.maxIterations = n;
        i++;
        break;
      }
      case "--reports-dir": {
        if (!next) return { ok: false, message: t("needPath", { flag: a }) };
        args.reportsDir = next;
        i++;
        break;
      }
      case "--signature": {
        if (!next) return { ok: false, message: t("needSignature", { flag: a }) };
        args.signature = next;
        i++;
        break;
      }
      case "--json":
        args.json = true;
        break;
      case "--sandbox":
        args.sandbox = true;
        break;
      case "--version":
        console.log(VERSION);
        process.exit(0);
      case "-h":
      case "--help":
        console.log(helpText());
        process.exit(0);
      default:
        if (a.startsWith("-")) {
          return { ok: false, message: t("unknownFlag", { flag: a }) };
        }
        positional.push(a);
    }
  }
  if (args.taskFile) {
    try {
      args.topic = readFileSync(resolve(args.taskFile), "utf-8").trim();
    } catch {
      return { ok: false, message: t("taskFileReadFail", { file: args.taskFile }) };
    }
    if (!args.topic) return { ok: false, message: t("taskFileEmpty", { file: args.taskFile }) };
  } else {
    args.topic = positional.join(" ");
  }
  if (!args.topic) args.topic = t("defaultTopic");
  return { ok: true, args };
}

async function runMain(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(t("errPrefix", { msg: parsed.message }));
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
      t("banner", {
        version: VERSION,
        mode: args.mock ? t("modeMock") : t("modeReal"),
        topic: args.topic,
      }),
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
    sandbox: args.sandbox,
    repoRoot: root,
    approval: args.sandbox ? { mode: "auto" } : undefined,
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
      console.log(t("delivered"));
    } else {
      console.log(t("circuit"));
    }
    process.exitCode = result.status === "delivered" ? 0 : 1;
  } catch (e) {
    if (args.json) {
      console.log(JSON.stringify({ error: (e as Error).message, logs }, null, 2));
    } else {
      console.error(t("runFail", { msg: (e as Error).message }));
    }
    process.exitCode = 2;
  }
}

// ── 分派 ─────────────────────────────────────────────────────

const argv = process.argv.slice(2);
if (argv[0] === "sandbox") {
  process.exit(runSandboxCommand(argv.slice(1), resolve(import.meta.dirname, "..")));
} else if (argv[0] === "tui") {
  const mock = argv.includes("--mock");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--lang") {
      const v = argv[i + 1];
      const lang = v ? parseLang(v) : null;
      if (!v || !lang) {
        console.error(t("errPrefix", { msg: t("needLang") }));
        process.exit(2);
      }
      setLang(lang);
    }
  }
  const root = resolve(import.meta.dirname, "..");
  const { runTui } = await import("../src/tui/app");
  runTui({ mock, root });
} else if (argv[0] === "watch") {
  const code = runWatchCommand(argv.slice(1));
  // 失敗立即退出；成功交還事件迴圈——
  // once 模式渲染完自然結束，連續模式由 setInterval 保持存活（嚴禁 process.exit 打斷輪詢）
  if (code !== 0) process.exit(code);
} else {
  await runMain(argv);
}
