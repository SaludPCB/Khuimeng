import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadSeats } from "../src/agent/seat-loader";
import {
  buildTranscriptFor,
  executeCommand,
  parseCommand,
  type ChatTurn,
  type TuiContext,
} from "../src/tui/commands";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let tmp = "";

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function makeCtx(): TuiContext {
  tmp = resolve(
    tmpdir(),
    `khuimeng-ask-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmp, { recursive: true });
  return {
    mock: true,
    seats: loadSeats(resolve(root, "configs/seats.yaml")),
    agentsDir: resolve(root, "agents"),
    reportsDir: tmp,
    sessionsDir: resolve(tmp, "sessions"),
    session: { name: "s" },
    repoRoot: root,
    approvalMode: "auto",
    messages: [],
    chat: [],
    emit: () => {},
    busy: () => {},
    exit: () => {},
  };
}

describe("parseCommand：/ask", () => {
  it("解析角色與整句問題", () => {
    expect(parseCommand("/ask viewer coder 分析得正確嗎")).toEqual({
      type: "ask",
      role: "viewer",
      text: "coder 分析得正確嗎",
    });
  });
  it("缺角色或缺問題由執行層擋", () => {
    expect(parseCommand("/ask").type).toBe("ask");
    const bare = parseCommand("/ask viewer");
    expect(bare.type === "ask" && bare.text).toBe("");
  });
});

describe("buildTranscriptFor（目標角色視角）", () => {
  const chat: ChatTurn[] = [
    { role: "user", content: "分析程式碼" },
    { role: "coder", content: "我分析了…" },
    { role: "viewer", content: "coder 第 2 點有誤" },
    { role: "coder", content: "接受,修正" },
  ];

  it("問 coder：自己的話=assistant，viewer 的話帶名牌", () => {
    const tr = buildTranscriptFor(chat, "coder");
    expect(tr[0]).toEqual({ role: "user", content: "分析程式碼" });
    expect(tr[1]?.role).toBe("assistant");
    expect(tr[2]?.role).toBe("user");
    expect(tr[2]?.content).toContain("[Viewer] coder 第 2 點有誤");
  });

  it("問 viewer：viewer 的話=assistant，coder 的話帶名牌", () => {
    const tr = buildTranscriptFor(chat, "viewer");
    expect(tr[2]?.role).toBe("assistant");
    expect(tr[1]?.content).toContain("[Coder] 我分析了…");
    expect(tr[3]?.content).toContain("[Coder] 接受,修正");
  });
});

describe("executeCommand：三方會診（mock）", () => {
  it("直接打字→Coder 回覆；/ask viewer→Viewer 回覆並記名", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "分析這段程式碼");
    expect(ctx.messages.at(-1)?.kind).toBe("coder");
    await executeCommand(ctx, "/ask viewer coder 分析得正確嗎");
    expect(ctx.messages.at(-1)?.kind).toBe("viewer");
    expect(ctx.chat.at(-1)?.role).toBe("viewer");
    await executeCommand(ctx, "/ask coder 你對 viewer 的看法？");
    expect(ctx.messages.at(-1)?.kind).toBe("coder");
    // 對話紀錄三方俱全
    const roles = ctx.chat.map((t) => t.role);
    expect(roles).toContain("viewer");
    expect(ctx.chat).toHaveLength(6);
  });

  it("/ask 非法角色擋下", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/ask boss 你好");
    expect(ctx.messages.at(-1)?.kind).toBe("error");
  });

  it("/ask 缺問題擋下", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/ask viewer");
    expect(ctx.messages.at(-1)?.kind).toBe("error");
  });
});
