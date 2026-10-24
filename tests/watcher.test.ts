import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { chainStatus, latestReport, renderPanel, roleReports, runWatcher } from "../src/pipeline/watcher";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let dir = "";

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function newDir(): string {
  dir = resolve(tmpdir(), `khuimeng-watch-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const CODER_REPORT = `---
role: coder
iteration: 1
depends_on: []
target_files: ["src/x.ts"]
verdict: na
---

# Coder 報告
做了某事
`;

describe("watcher 純函式", () => {
  it("roleReports：只挑該角色檔並按輪次排序", () => {
    const d = newDir();
    writeFileSync(resolve(d, "coder_01_a_mock.md"), CODER_REPORT);
    writeFileSync(resolve(d, "coder_02_b_mock.md"), CODER_REPORT);
    writeFileSync(resolve(d, "viewer_01_c_mock.md"), "x");
    expect(roleReports(d, "coder")).toEqual(["coder_01_a_mock.md", "coder_02_b_mock.md"]);
    expect(roleReports(d, "tester")).toEqual([]);
  });

  it("latestReport：無報告回 null", () => {
    expect(latestReport(newDir(), "viewer")).toBeNull();
  });

  it("renderPanel：等待狀態含管線狀態三行", () => {
    const panel = renderPanel(newDir(), "coder");
    expect(panel).toContain("Khuimeng WATCH · CODER");
    expect(panel).toContain("等待中");
    expect(panel).toContain("coder");
    expect(panel).toContain("viewer");
    expect(panel).toContain("tester");
  });

  it("renderPanel：有報告時顯示輪次/判定/本文/依賴", () => {
    const d = newDir();
    writeFileSync(resolve(d, "coder_01_demo_zc.md"), CODER_REPORT);
    const panel = renderPanel(d, "coder");
    expect(panel).toContain("coder_01_demo_zc.md");
    expect(panel).toContain("輪次   1");
    expect(panel).toContain("判定   na");
    expect(panel).toContain("# Coder 報告");
  });

  it("renderPanel：frontmatter 不合法時顯示警告且不炸", () => {
    const d = newDir();
    writeFileSync(resolve(d, "coder_01_bad_x.md"), "不是報告");
    const panel = renderPanel(d, "coder");
    expect(panel).toContain("⚠");
    expect(panel).toContain("解析失敗");
  });

  it("chainStatus：各角色最新輪次與判定", () => {
    const d = newDir();
    writeFileSync(
      resolve(d, "viewer_02_demo_zc.md"),
      `---\nrole: viewer\niteration: 2\ndepends_on: []\ntarget_files: []\nverdict: approve\n---\n\nok`,
    );
    const status = chainStatus(d);
    expect(status).toContain("viewer 第 2 輪 · approve");
    expect(status).toContain("coder  —");
  });

  it("runWatcher --once：渲染一次即返回（冒煙）", () => {
    const d = newDir();
    writeFileSync(resolve(d, "tester_01_demo_zc.md"), CODER_REPORT.replace("role: coder", "role: tester").replace("verdict: na", "verdict: pass"));
    const panels: string[] = [];
    runWatcher("tester", d, { once: true, write: (p) => panels.push(p) });
    expect(panels).toHaveLength(1);
    expect(panels[0]).toContain("Khuimeng WATCH · TESTER");
  });

  it("runWatcher --once：對真實 reports/pipeline 也可渲染（不空拋）", () => {
    const panels: string[] = [];
    runWatcher("coder", resolve(root, "reports/pipeline"), { once: true, write: (p) => panels.push(p) });
    expect(panels).toHaveLength(1);
  });
});
