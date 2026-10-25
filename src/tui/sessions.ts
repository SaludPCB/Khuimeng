import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import type { ChatTurn, TuiContext, TuiMessage } from "./commands";

/** TUI session：對話（chat）與畫面訊息（messages）打包存 JSON，支援跨次續跑 */
export interface SessionData {
  version: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  chat: ChatTurn[];
  messages: TuiMessage[];
}

export interface SessionSummary {
  name: string;
  updatedAt: string;
  turns: number;
}

/** 合法名稱：1-32 字，中英文/數字/底線/連字號（防路徑跳脫） */
export function isValidSessionName(name: string): boolean {
  return /^[\w\u4e00-\u9fff][\w\u4e00-\u9fff-]{0,31}$/.test(name);
}

/** 自動命名：session-YYYYMMDD-HHMMSS */
export function newSessionName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `session-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export function sessionFile(sessionsDir: string, name: string): string {
  return resolve(sessionsDir, `${name}.json`);
}

export function saveSession(ctx: TuiContext): void {
  mkdirSync(ctx.sessionsDir, { recursive: true });
  const file = sessionFile(ctx.sessionsDir, ctx.session.name);
  const now = new Date().toISOString();
  let createdAt = now;
  try {
    const prev = JSON.parse(readFileSync(file, "utf-8")) as SessionData;
    createdAt = prev.createdAt ?? now;
  } catch {
    // 首次存檔或舊檔壞——使用 now
  }
  const data: SessionData = {
    version: 1,
    name: ctx.session.name,
    createdAt,
    updatedAt: now,
    chat: ctx.chat,
    messages: ctx.messages,
  };
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export function loadSession(sessionsDir: string, name: string): SessionData | null {
  try {
    const data = JSON.parse(
      readFileSync(sessionFile(sessionsDir, name), "utf-8"),
    ) as SessionData;
    if (!Array.isArray(data.chat) || !Array.isArray(data.messages)) return null;
    return data;
  } catch {
    return null;
  }
}

export function listSessions(sessionsDir: string): SessionSummary[] {
  let files: string[] = [];
  try {
    files = readdirSync(sessionsDir);
  } catch {
    return [];
  }
  const out: SessionSummary[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const data = JSON.parse(
        readFileSync(resolve(sessionsDir, f), "utf-8"),
      ) as SessionData;
      out.push({
        name: data.name ?? f.replace(/\.json$/, ""),
        updatedAt: data.updatedAt ?? "",
        turns: Math.floor((data.chat?.length ?? 0) / 2),
      });
    } catch {
      // 壞檔略過
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function renameSessionFile(
  sessionsDir: string,
  from: string,
  to: string,
): void {
  const src = sessionFile(sessionsDir, from);
  if (existsSync(src)) renameSync(src, sessionFile(sessionsDir, to));
}
