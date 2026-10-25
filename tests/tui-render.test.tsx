import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { loadSeats } from "../src/agent/seat-loader";
import { App } from "../src/tui/app";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let tmpReports = "";

afterEach(() => {
  if (tmpReports) rmSync(tmpReports, { recursive: true, force: true });
});

function mount() {
  tmpReports = resolve(
    tmpdir(),
    `khuimeng-tui-r-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tmpReports, { recursive: true });
  return render(
    <App
      mock={true}
      seats={loadSeats(resolve(root, "configs/seats.yaml"))}
      agentsDir={resolve(root, "agents")}
      reportsDir={tmpReports}
      sessionsDir={resolve(tmpReports, "sessions")}
    />,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("TUI 畫面渲染（ink-testing-library 模擬打字）", () => {
  it("歡迎訊息出現", async () => {
    const t = mount();
    await sleep(200);
    expect(t.lastFrame()).toContain("Khuimeng TUI");
    t.unmount();
  });

  it("打字送出 → Coder mock 回覆出現在畫面上（原Static 不渲染回歸）", async () => {
    const t = mount();
    await sleep(100);
    t.stdin.write("你好，幫我寫一個倒數計時網頁");
    await sleep(150);
    t.stdin.write("\r");
    await sleep(400);
    const frame = t.lastFrame() ?? "";
    expect(frame).toContain("幫我寫一個倒數計時網頁");
    expect(frame).toContain("mock 模式");
    t.unmount();
  });

  it("/help → 指令集出現", async () => {
    const t = mount();
    await sleep(100);
    t.stdin.write("/help");
    await sleep(150);
    t.stdin.write("\r");
    await sleep(400);
    expect(t.lastFrame()).toContain("/viewer");
    t.unmount();
  });

  it("對話後 /viewer → verdict 摘要出現", async () => {
    const t = mount();
    await sleep(100);
    t.stdin.write("我做了一個東西");
    await sleep(150);
    t.stdin.write("\r");
    await sleep(400);
    t.stdin.write("/viewer");
    await sleep(150);
    t.stdin.write("\r");
    await sleep(400);
    const frame = t.lastFrame() ?? "";
    expect(frame).toContain("approve");
    t.unmount();
  });

  it("未知指令 → 錯誤提示", async () => {
    const t = mount();
    await sleep(100);
    t.stdin.write("/fly");
    await sleep(150);
    t.stdin.write("\r");
    await sleep(400);
    expect(t.lastFrame()).toContain("未知指令");
    t.unmount();
  });
});
