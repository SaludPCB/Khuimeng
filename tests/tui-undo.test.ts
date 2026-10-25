import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadSeats } from "../src/agent/seat-loader";
import { executeCommand, parseCommand, type TuiContext } from "../src/tui/commands";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let tmp = "";
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function makeCtx(): TuiContext {
  tmp = resolve(
    tmpdir(),
    `khuimeng-undo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

describe("parseCommand：/undo /retry", () => {
  it("undo 帶/不帶 N", () => {
    expect(parseCommand("/undo")).toEqual({ type: "undo", n: undefined });
    expect(parseCommand("/undo 2")).toEqual({ type: "undo", n: 2 });
    const bad = parseCommand("/undo x");
    expect(bad.type === "undo" && bad.n).toBeUndefined();
  });
  it("retry 無參數", () => {
    expect(parseCommand("/retry")).toEqual({ type: "retry" });
  });
});

describe("/undo", () => {
  it("倒退一輪：chat 與畫面同步修剪", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "Q1");
    await executeCommand(ctx, "Q2");
    expect(ctx.chat).toHaveLength(4);
    await executeCommand(ctx, "/undo");
    expect(ctx.chat).toHaveLength(2);
    expect(ctx.chat.at(-1)?.role).toBe("coder"); // 剩 Q1 與其回覆
    // 最後一輪的 user 訊息已從畫面移除
    expect(ctx.messages.some((m) => m.kind === "user" && m.text === "Q2")).toBe(false);
    expect(ctx.messages.some((m) => m.kind === "user" && m.text === "Q1")).toBe(true);
  });

  it("倒退多輪與超出邊界", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "Q1");
    await executeCommand(ctx, "Q2");
    await executeCommand(ctx, "/undo 5"); // 超出→清到沒有為止（2 輪全倒）
    expect(ctx.chat).toHaveLength(0);
    expect(ctx.messages.at(-1)?.text).toContain("已倒退 2 輪");
  });

  it("沒有可倒退→錯誤", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/undo");
    expect(ctx.messages.at(-1)?.kind).toBe("error");
  });

  it("取消輪（只有提問無回覆）也可倒退", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "Q1");
    ctx.chat.push({ role: "user", content: "Q2-cancelled", to: "coder" }); // 模擬 ESC 取消後
    await executeCommand(ctx, "/undo");
    expect(ctx.chat.at(-1)?.role).toBe("coder"); // 回到 Q1 的回覆
  });
});

describe("/retry", () => {
  it("重送最後提問（含收件人 vai → viewer 再回）", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "問 coder 一");
    await executeCommand(ctx, "/ask vai 檢查一下");
    expect(ctx.messages.at(-1)?.kind).toBe("viewer");
    await executeCommand(ctx, "/retry");
    expect(ctx.messages.at(-1)?.kind).toBe("viewer"); // 重送後仍是 viewer 回
    expect(ctx.messages.at(-1)?.text).toContain("檢查一下");
  });

  it("對 coder 的最後提問也可重送", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "hello");
    await executeCommand(ctx, "/retry");
    expect(ctx.messages.at(-1)?.kind).toBe("coder");
    expect(ctx.messages.at(-1)?.text).toContain("hello");
  });

  it("沒有提問→錯誤", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/retry");
    expect(ctx.messages.at(-1)?.kind).toBe("error");
  });
});
