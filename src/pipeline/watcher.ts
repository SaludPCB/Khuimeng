import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseReport, ROLES, type PipelineRole } from "./report-pipeline";
import { getLang, t } from "../i18n";

/** 報告條目：檔名＋落盤時間（mtime） */
/** 面板標籤對齊：zh 標籤寬 5（2 字＋3 空格）、en 寬 7 */
function label(text: string): string {
  return text.padEnd(getLang() === "en" ? 7 : 5, " ");
}

export interface ReportEntry {
  file: string;
  mtimeMs: number;
}

/** 過濾條件：since=只看此時間之後落盤的報告（待命語義）；match=檔名關鍵字（任務 slug） */
export interface WatchFilter {
  since?: number;
  match?: string;
}

/** 列出某角色的報告，依落盤時間排序（最新寫入的排最後；時間相同按檔名） */
export function roleReports(
  dir: string,
  role: PipelineRole,
  filter: WatchFilter = {},
): ReportEntry[] {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  const entries: ReportEntry[] = [];
  for (const f of files) {
    if (!f.startsWith(`${role}_`) || !f.endsWith(".md")) continue;
    if (filter.match && !f.includes(filter.match)) continue;
    let mtimeMs: number;
    try {
      mtimeMs = statSync(resolve(dir, f)).mtimeMs;
    } catch {
      continue;
    }
    if (filter.since !== undefined && mtimeMs < filter.since) continue;
    entries.push({ file: f, mtimeMs });
  }
  return entries.sort((a, b) => a.mtimeMs - b.mtimeMs || a.file.localeCompare(b.file));
}

/** 最新一份報告檔名（依落盤時間，非檔名排序）；無則 null */
export function latestReport(
  dir: string,
  role: PipelineRole,
  filter: WatchFilter = {},
): string | null {
  const list = roleReports(dir, role, filter);
  return list.length > 0 ? list.at(-1)!.file : null;
}

/** 管線狀態列：三角色各自最新輪次與判定（尊重過濾條件，只反映「新」報告） */
export function chainStatus(dir: string, filter: WatchFilter = {}): string {
  return ROLES.map((r) => {
    const file = latestReport(dir, r, filter);
    if (!file) return `  ${r.padEnd(6)} —`;
    try {
      const { fm } = parseReport(readFileSync(resolve(dir, file), "utf-8"));
      return `  ${r.padEnd(6)} ${t("chainRound", { n: fm.iteration, verdict: fm.verdict })}`;
    } catch {
      return `  ${r.padEnd(6)} ${t("chainParseFail", { file })}`;
    }
  }).join("\n");
}

export interface PanelOptions {
  filter?: WatchFilter;
  now?: Date;
}

/**
 * 渲染單一角色的觀測面板（純函式）。
 * 無符合報告 → 待命態（附「上次」＝啟動前最後一份）；有 → 最新報告完整面板。
 */
export function renderPanel(
  dir: string,
  role: PipelineRole,
  opts: PanelOptions = {},
): string {
  const filter = opts.filter ?? {};
  const now = opts.now ?? new Date();
  const bar = "═".repeat(56);
  const header = `╔${bar}╗\n║ Khuimeng WATCH · ${role.toUpperCase().padEnd(38)} ║\n╚${bar}╝`;
  const file = latestReport(dir, role, filter);
  if (!file) {
    const previous =
      filter.since !== undefined ? latestReport(dir, role) : null;
    return [
      header,
      "",
      `  ${t("watchStandby")}${filter.match ? t("watchFilterSuffix", { kw: filter.match }) : ""}`,
      ...(previous
        ? [`  ${label(t("watchLastLabel"))}${previous}${t("watchLastSuffix")}`]
        : []),
      "",
      t("watchStatusTitle") + "─".repeat(42),
      chainStatus(dir, filter),
      "",
      t("watchFooter", { time: now.toLocaleTimeString() }),
    ].join("\n");
  }
  let meta: string;
  let body: string;
  try {
    const parsed = parseReport(readFileSync(resolve(dir, file), "utf-8"));
    meta = [
      `${label(t("wFile"))}${file}`,
      `${label(t("wRound"))}${parsed.fm.iteration}`,
      `${label(t("wVerdict"))}${parsed.fm.verdict}`,
      `${label(t("wDeps"))}${parsed.fm.depends_on.length > 0 ? parsed.fm.depends_on.join(", ") : "—"}`,
    ].join("\n");
    body = parsed.body.trim();
  } catch (e) {
    meta = `  ⚠ ${file}: ${(e as Error).message}`;
    body = readFileSync(resolve(dir, file), "utf-8").trim();
  }
  return [
    header,
    meta,
    "─".repeat(58),
    body,
    t("watchStatusTitle") + "─".repeat(42),
    chainStatus(dir, filter),
    "",
    t("watchFooter", { time: now.toLocaleTimeString() }),
  ].join("\n");
}

export interface WatcherOptions {
  /** 只渲染一次即返回：顯示「現在」最新面板（忽略待命時間戳，可搭配 match） */
  once?: boolean;
  /** 只盯檔名含此關鍵字的報告（任務 slug，多任務並行時不互搶） */
  match?: string;
  /** 輪詢間隔，預設 800ms */
  intervalMs?: number;
  /** 輸出函式，預設清屏後整面板重繪 */
  write?: (panel: string) => void;
}

/**
 * 觀測迴圈（待命語義）：只顯示「本 watcher 啟動後」落盤的新報告，
 * 啟動前既有的只在待命畫面以「上次」一行帶過；新報告出現即清屏重繪。
 */
export function runWatcher(
  role: PipelineRole,
  reportsDir: string,
  opts: WatcherOptions = {},
): void {
  const write =
    opts.write ?? ((panel) => process.stdout.write(`\x1B[2J\x1B[H${panel}\n`));
  if (opts.once) {
    write(renderPanel(reportsDir, role, { filter: { match: opts.match } }));
    return;
  }
  const filter: WatchFilter = { since: Date.now(), match: opts.match };
  let lastFile: string | null = null;
  let first = true;

  const tick = (): void => {
    const file = latestReport(reportsDir, role, filter);
    if (first || file !== lastFile) {
      lastFile = file;
      first = false;
      write(renderPanel(reportsDir, role, { filter }));
    }
  };

  tick();
  setInterval(tick, opts.intervalMs ?? 800);
}
