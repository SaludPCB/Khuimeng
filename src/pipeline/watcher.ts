import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseReport, ROLES, type PipelineRole } from "./report-pipeline";

/** 列出某角色在報告目錄的全部報告檔（依檔名排序＝依輪次） */
export function roleReports(dir: string, role: PipelineRole): string[] {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const prefix = `${role}_`;
  return files.filter((f) => f.startsWith(prefix) && f.endsWith(".md")).sort();
}

/** 最新一份報告檔名；無則 null */
export function latestReport(dir: string, role: PipelineRole): string | null {
  const files = roleReports(dir, role);
  return files.length > 0 ? files.at(-1)! : null;
}

/** 管線狀態列：三角色各自最新輪次與判定（每個視窗都能看到全鏈進度） */
export function chainStatus(dir: string): string {
  return ROLES.map((r) => {
    const file = latestReport(dir, r);
    if (!file) return `  ${r.padEnd(6)} —（尚無報告）`;
    try {
      const { fm } = parseReport(readFileSync(resolve(dir, file), "utf-8"));
      return `  ${r.padEnd(6)} 第 ${fm.iteration} 輪 · ${fm.verdict}`;
    } catch {
      return `  ${r.padEnd(6)} ⚠ ${file} 解析失敗`;
    }
  }).join("\n");
}

/** 渲染單一角色的觀測面板（純函式，可測試） */
export function renderPanel(
  dir: string,
  role: PipelineRole,
  now = new Date(),
): string {
  const bar = "═".repeat(56);
  const header = `╔${bar}╗\n║ Khuimeng WATCH · ${role.toUpperCase().padEnd(38)} ║\n╚${bar}╝`;
  const file = latestReport(dir, role);
  if (!file) {
    return [
      header,
      "",
      "  等待中…此角色尚未產出報告",
      "",
      "── 管線狀態 " + "─".repeat(42),
      chainStatus(dir),
      "",
      `（${now.toLocaleTimeString()} 刷新；Ctrl+C 離開）`,
    ].join("\n");
  }
  let meta: string;
  let body: string;
  try {
    const parsed = parseReport(readFileSync(resolve(dir, file), "utf-8"));
    meta = [
      `  檔案   ${file}`,
      `  輪次   ${parsed.fm.iteration}`,
      `  判定   ${parsed.fm.verdict}`,
      `  依賴   ${parsed.fm.depends_on.length > 0 ? parsed.fm.depends_on.join(", ") : "—"}`,
    ].join("\n");
    body = parsed.body.trim();
  } catch (e) {
    meta = `  ⚠ ${file} frontmatter 解析失敗：${(e as Error).message}`;
    body = readFileSync(resolve(dir, file), "utf-8").trim();
  }
  return [
    header,
    meta,
    "─".repeat(58),
    body,
    "── 管線狀態 " + "─".repeat(42),
    chainStatus(dir),
    "",
    `（${now.toLocaleTimeString()} 刷新；Ctrl+C 離開）`,
  ].join("\n");
}

export interface WatcherOptions {
  /** 只渲染一次即返回（冒煙測試／CI 用） */
  once?: boolean;
  /** 輪詢間隔，預設 800ms */
  intervalMs?: number;
  /** 輸出函式，預設清屏後整面板重繪 */
  write?: (panel: string) => void;
}

/** 觀測迴圈：輪詢報告目錄，該角色出現新報告即重繪面板 */
export function runWatcher(
  role: PipelineRole,
  reportsDir: string,
  opts: WatcherOptions = {},
): void {
  const write =
    opts.write ?? ((panel) => process.stdout.write(`\x1B[2J\x1B[H${panel}\n`));
  let lastFile: string | null = null;
  let first = true;

  const tick = (): void => {
    const file = latestReport(reportsDir, role);
    if (first || file !== lastFile) {
      lastFile = file;
      first = false;
      write(renderPanel(reportsDir, role));
    }
  };

  tick();
  if (opts.once) return;
  setInterval(tick, opts.intervalMs ?? 800);
}
