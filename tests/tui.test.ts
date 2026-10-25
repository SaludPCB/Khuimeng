import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadSeats } from "../src/agent/seat-loader";
import {
  executeCommand,
  parseCommand,
  reportPreview,
  transcriptDigest,
  type TuiContext,
} from "../src/tui/commands";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let tmpReports = "";

afterEach(() => {
  if (tmpReports) rmSync(tmpReports, { recursive: true, force: true });
});

function makeCtx(): TuiContext {
  tmpReports = resolve(
    tmpdir(),
    `khuimeng-tui-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmpReports, { recursive: true });
  return {
    mock: true,
    seats: loadSeats(resolve(root, "configs/seats.yaml")),
    agentsDir: resolve(root, "agents"),
    reportsDir: tmpReports,
    sessionsDir: resolve(tmpReports, "sessions"),
    session: { name: "test-session" },
    repoRoot: root,
    approvalMode: "auto",
    messages: [],
    chat: [],
    emit: () => {},
    busy: () => {},
    exit: () => {},
  };
}

describe("parseCommand", () => {
  it("非斜線 → chat", () => {
    expect(parseCommand("幫我寫個網頁")).toEqual({ type: "chat", text: "幫我寫個網頁" });
  });
  it("/model 帶兩個參數", () => {
    expect(parseCommand("/model coder z-ai/glm-5.3-flash")).toEqual({
      type: "model",
      role: "coder",
      model: "z-ai/glm-5.3-flash",
    });
  });
  it("/task 帶整句", () => {
    expect(parseCommand('/task 寫一個 "任務"')).toEqual({
      type: "task",
      text: '寫一個 "任務"',
    });
  });
  it("未知指令", () => {
    expect(parseCommand("/fly")).toEqual({ type: "unknown", name: "/fly" });
  });
  it("/quit 視同 /exit", () => {
    expect(parseCommand("/quit").type).toBe("exit");
  });
});

describe("executeCommand（mock 環境）", () => {
  it("/help 列出指令集", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/help");
    expect(ctx.messages.at(-1)?.text).toContain("/viewer");
  });

  it("chat：mock Coder 回覆並記錄上下文", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "你好");
    expect(ctx.messages.map((m) => m.kind)).toContain("user");
    expect(ctx.messages.at(-1)?.kind).toBe("coder");
    expect(ctx.messages.at(-1)?.text).toContain("mock 模式");
    expect(ctx.chat).toHaveLength(2);
  });

  it("/viewer 無對話時提示先聊", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/viewer");
    expect(ctx.messages.at(-1)?.kind).toBe("error");
  });

  it("/viewer 有對話時：mock 審查報告落盤＋verdict 顯示", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "我寫了一個 3D 魔方頁面");
    await executeCommand(ctx, "/viewer");
    const last = ctx.messages.at(-1)!;
    expect(last.kind).toBe("viewer");
    expect(last.meta).toContain("approve");
    const files = readdirSync(tmpReports);
    expect(files.some((f) => f.startsWith("viewer_01_") && f.endsWith("_tui.md"))).toBe(true);
  });

  it("/model 換席生效（in-memory）", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/model viewer z-ai/glm-5.3-flash");
    expect(ctx.seats.seats.viewer?.model).toBe("z-ai/glm-5.3-flash");
    expect(ctx.messages.at(-1)?.kind).toBe("system");
  });

  it("/model 非法角色擋下", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/model boss x");
    expect(ctx.messages.at(-1)?.kind).toBe("error");
  });

  it("/reports 空目錄不炸", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/reports");
    expect(ctx.messages.at(-1)?.text).toContain("尚無報告");
  });

  it("未知指令提示", async () => {
    const ctx = makeCtx();
    await executeCommand(ctx, "/fly");
    expect(ctx.messages.at(-1)?.text).toContain("未知指令");
  });
});

describe("輔助函式", () => {
  it("transcriptDigest 截尾保留最近輪次", () => {
    const chat = [
      { role: "user" as const, content: "舊訊息1" },
      { role: "coder" as const, content: "舊回覆1" },
      { role: "user" as const, content: "新訊息" },
    ];
    const digest = transcriptDigest(chat, 1);
    expect(digest).toContain("新訊息");
    expect(digest).toContain("老闆：");
    expect(digest).not.toContain("舊訊息1");
  });

  it("reportPreview 超長截尾", () => {
    const body = Array.from({ length: 100 }, (_, i) => `行 ${i}`).join("\n");
    const preview = reportPreview(body, 10);
    expect(preview).toContain("行 9");
    expect(preview).toContain("後續 90 行");
    expect(reportPreview("短文", 10)).toBe("短文");
  });
});
