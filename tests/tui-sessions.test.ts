import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadSeats } from "../src/agent/seat-loader";
import { executeCommand } from "../src/tui/commands";
import {
  isValidSessionName,
  listSessions,
  loadSession,
  newSessionName,
  saveSession,
  type SessionData,
} from "../src/tui/sessions";
import type { TuiContext } from "../src/tui/commands";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let tmp = "";

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function makeCtx(): TuiContext {
  tmp = resolve(
    tmpdir(),
    `khuimeng-sess-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmp, { recursive: true });
  return {
    mock: true,
    seats: loadSeats(resolve(root, "configs/seats.yaml")),
    agentsDir: resolve(root, "agents"),
    reportsDir: tmp,
    sessionsDir: resolve(tmp, "sessions"),
    session: { name: "s1" },
    repoRoot: root,
    approvalMode: "auto",
    messages: [],
    chat: [],
    emit: () => {},
    busy: () => {},
    exit: () => {},
  };
}

describe("sessions 純函式", () => {
  it("名稱驗證：合法與非法", () => {
    expect(isValidSessionName("s1")).toBe(true);
    expect(isValidSessionName("my-session-2")).toBe(true);
    expect(isValidSessionName("中文節")).toBe(true);
    expect(isValidSessionName("")).toBe(false);
    expect(isValidSessionName("../escape")).toBe(false);
    expect(isValidSessionName("a".repeat(33))).toBe(false);
  });

  it("自動命名格式 session-YYYYMMDD-HHMMSS", () => {
    expect(newSessionName(new Date("2026-10-24T08:05:09"))).toBe(
      "session-20261024-080509",
    );
  });

  it("save→load 往返、list 排序與輪數", () => {
    const ctx = makeCtx();
    ctx.chat.push(
      { role: "user", content: "嗨" },
      { role: "coder", content: "你好" },
    );
    ctx.messages.push({ kind: "user", text: "嗨" });
    saveSession(ctx);
    const loaded = loadSession(ctx.sessionsDir, "s1") as SessionData;
    expect(loaded.chat).toHaveLength(2);
    expect(loaded.messages[0]?.text).toBe("嗨");
    const list = listSessions(ctx.sessionsDir);
    expect(list).toHaveLength(1);
    expect(list[0]?.turns).toBe(1);
  });

  it("loadSession 壞檔/不存在回 null", () => {
    const ctx = makeCtx();
    expect(loadSession(ctx.sessionsDir, "nope")).toBeNull();
  });
});

describe("TUI 新指令", () => {
  it("/provider：合法切換＋快取失效提示", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/provider coder openai");
    expect(ctx.seats.seats.coder?.provider).toBe("openai");
    expect(ctx.messages.at(-1)?.kind).toBe("system");
    expect(ctx.messages.at(-1)?.text).toContain("OPENAI_API_KEY");
  });

  it("/provider 帶 base_url 一併設定", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/provider coder openai https://api.groq.com/openai/v1");
    expect(ctx.seats.seats.coder?.provider).toBe("openai");
    expect(ctx.seats.seats.coder?.base_url).toBe("https://api.groq.com/openai/v1");
  });

  it("/provider 非法供應商擋下", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/provider coder aws");
    expect(ctx.messages.at(-1)?.kind).toBe("error");
    expect(ctx.seats.seats.coder?.provider).toBe("nvidia");
  });

  it("/rename＋/sessions：改名後列表可見", async () => {
    const ctx = makeCtx();
    ctx.chat.push(
      { role: "user", content: "a" },
      { role: "coder", content: "b" },
    );
    saveSession(ctx);
    await executeCommand(ctx, "/rename 魔方討論");
    expect(ctx.session.name).toBe("魔方討論");
    await executeCommand(ctx, "/sessions");
    expect(ctx.messages.at(-1)?.text).toContain("魔方討論");
    expect(ctx.messages.at(-1)?.text).toContain("1 輪");
  });

  it("/resume：找不到→錯誤；存過→續跑還原對話", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/resume ghost");
    expect(ctx.messages.at(-1)?.kind).toBe("error");

    ctx.chat.push(
      { role: "user", content: "舊訊" },
      { role: "coder", content: "舊答" },
    );
    saveSession(ctx);
    ctx.chat.length = 0;
    await executeCommand(ctx, "/resume s1");
    expect(ctx.chat).toHaveLength(2);
    expect(ctx.session.name).toBe("s1");
    expect(ctx.messages.at(-1)?.text).toContain("已續跑");
  });

  it("/resume 非法名稱擋下", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/resume ../etc");
    expect(ctx.messages.at(-1)?.kind).toBe("error");
  });

  it("/sessions 空目錄→尚無提示", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/sessions");
    expect(ctx.messages.at(-1)?.text).toContain("尚無");
  });
});
