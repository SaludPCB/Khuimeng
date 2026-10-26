import { exec } from "node:child_process";
import { promisify } from "node:util";

/**
 * Shell 手（P2-2）：沙箱目錄內的白名單指令執行。
 * 三道欄杆：deny 樣式表（連問都不問）→ 白名單前綴 → 權限門（y/a/n）；
 * 再加逾時與輸出截斷防失控。工作目錄鎖死在沙箱。
 */

const execAsync = promisify(exec);

/** 白名單前綴（對齊測試/建置/唯讀查詢場景） */
const ALLOW_PREFIXES: readonly string[] = [
  "npm test",
  "npm run typecheck",
  "npm run",
  "npx vitest",
  "npx tsc",
  "node",
  "tsc",
  "git status",
  "git diff",
  "git log",
  "ls",
  "cat",
];

/**
 * 危險樣式（自動拒絕，不進入詢問）——參考 opencode policy / Hermes 危險清單。
 * P0 封堵（安全審視 2026-10-25 實測漏洞）：
 *   - 行內程式碼（node/npx/tsx -e/--eval）：等於任意代碼執行，繞過一切圍欄
 *   - 特殊符號（; | & ` 與 $(…)）：命令串接/替換注入
 *   - 路徑逃逸（../ 與絕對路徑參數、~/）：指令參數不受 cwd 圍欄保護
 */
const DENY_PATTERNS: readonly RegExp[] = [
  /\b(node|npx|tsx)\b[^|;&`]*\s(-e|--eval)(\s|$)/,
  /[;|&`]|\$\(/,
  /\.\./,
  /(^|\s)=?~\//,
  /(^|\s)\/[^\s]*/,
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive)/i,
  /\bsudo\b/i,
  /\bshutdown\b|\breboot\b/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{.*\}\s*;/, // fork bomb
  /\b(curl|wget)\b[^|]*\|\s*(ba|z|da)?sh\b/i, // 管線下載直執行
  />\s*\/dev\/sd[a-z]/i,
  /\bchmod\s+777\s+\/(?!tmp|var\/folders)\S/i,
  /[>]{1,2}\s*\/(etc|System|Library|usr\/bin|Windows)\b/i,
  /\bgit\s+push\b[^\n]*(-f\b|--force|--force-with-lease)/i,
];

export function isAllowedCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  return ALLOW_PREFIXES.some((p) => trimmed === p || trimmed.startsWith(`${p} `));
}

export function isDeniedPattern(cmd: string): boolean {
  return DENY_PATTERNS.some((re) => re.test(cmd));
}

export interface RunOptions {
  cwd: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}

export interface RunResult {
  ok: boolean;
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

/** 執行（呼叫前應已通過 isDeniedPattern/isAllowedCommand/權限門） */
export async function runShell(
  cmd: string,
  opts: RunOptions,
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxOut = opts.maxOutputChars ?? 8192;
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: opts.cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      killSignal: "SIGKILL",
    });
    const output = truncate(`${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`, maxOut);
    return { ok: true, exitCode: 0, output, timedOut: false };
  } catch (e) {
    const err = e as {
      killed?: boolean;
      signal?: string;
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message: string;
    };
    if (err.killed || err.signal === "SIGKILL") {
      return {
        ok: false,
        exitCode: null,
        output: `逾時（${timeoutMs}ms 上限，已強制終止）`,
        timedOut: true,
      };
    }
    const output = truncate(
      `${err.stdout ?? ""}${err.stderr ? `\n[stderr]\n${err.stderr}` : `\n${err.message}`}`,
      maxOut,
    );
    return {
      ok: false,
      exitCode: typeof err.code === "number" ? err.code : null,
      output,
      timedOut: false,
    };
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…（輸出截斷，共 ${text.length} 字元）`;
}
