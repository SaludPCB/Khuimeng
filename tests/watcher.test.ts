import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
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

/** 寫檔並把 mtime 設為指定時間（精準控制「落盤時間」） */
function writeAt(d: string, file: string, content: string, isoTime: string): void {
  const p = resolve(d, file);
  writeFileSync(p, content);
  const t = new Date(isoTime);
  utimesSync(p, t, t);
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

describe("watcher：落盤時間排序與過濾", () => {
  it("最新判定依 mtime 而非檔名排序（修復主 bug）", () => {
    const d = newDir();
    // coder_09 檔名排序較後但落盤較早；coder_01 檔名較前但落盤較新 → 最新應為 coder_01
    writeAt(d, "coder_09_zzz_x.md", CODER_REPORT, "2026-01-01T00:00:00Z");
    writeAt(d, "coder_01_aaa_x.md", CODER_REPORT, "2026-02-01T00:00:00Z");
    expect(latestReport(d, "coder")).toBe("coder_01_aaa_x.md");
    expect(roleReports(d, "coder").map((e) => e.file)).toEqual([
      "coder_09_zzz_x.md",
      "coder_01_aaa_x.md",
    ]);
  });

  it("since 過濾：晚於檔案 mtime 的啟動時間 → 待命（視為無新報告）", () => {
    const d = newDir();
    writeAt(d, "coder_08_old_x.md", CODER_REPORT, "2026-01-01T00:00:00Z");
    expect(latestReport(d, "coder", { since: Date.parse("2026-06-01") })).toBeNull();
    expect(latestReport(d, "coder", { since: Date.parse("2025-01-01") })).toBe(
      "coder_08_old_x.md",
    );
  });

  it("match 過濾：只盯任務 slug", () => {
    const d = newDir();
    writeAt(d, "coder_01_任務甲_mock.md", CODER_REPORT, "2026-01-01T00:00:00Z");
    writeAt(d, "coder_02_任務乙_mock.md", CODER_REPORT, "2026-01-02T00:00:00Z");
    expect(latestReport(d, "coder", { match: "任務甲" })).toBe("coder_01_任務甲_mock.md");
    expect(latestReport(d, "coder", { match: "不存在" })).toBeNull();
  });
});

describe("renderPanel", () => {
  it("待命態：空目錄顯示待命與管線狀態三行", () => {
    const panel = renderPanel(newDir(), "coder");
    expect(panel).toContain("Khuimeng WATCH · CODER");
    expect(panel).toContain("待命中");
    expect(panel).toContain("coder  —");
    expect(panel).toContain("viewer —");
    expect(panel).toContain("tester —");
  });

  it("待命態：目錄有啟動前舊報告 → 顯示「上次」一行（不全文上屏）", () => {
    const d = newDir();
    writeAt(d, "coder_08_watch_windows_zc.md", CODER_REPORT, "2026-01-01T00:00:00Z");
    const panel = renderPanel(d, "coder", { filter: { since: Date.parse("2026-06-01") } });
    expect(panel).toContain("待命中");
    expect(panel).toContain("上次   coder_08_watch_windows_zc.md");
    expect(panel).not.toContain("# Coder 報告");
  });

  it("上屏態：顯示輪次／判定／依賴／全文", () => {
    const d = newDir();
    writeFileSync(resolve(d, "coder_01_demo_zc.md"), CODER_REPORT);
    const panel = renderPanel(d, "coder");
    expect(panel).toContain("coder_01_demo_zc.md");
    expect(panel).toContain("輪次   1");
    expect(panel).toContain("判定   na");
    expect(panel).toContain("# Coder 報告");
  });

  it("壞 frontmatter 顯示警告且不炸", () => {
    const d = newDir();
    writeFileSync(resolve(d, "coder_01_bad_x.md"), "不是報告");
    const panel = renderPanel(d, "coder");
    expect(panel).toContain("⚠");
    expect(panel).toContain("解析失敗");
  });
});

describe("chainStatus", () => {
  it("各角色最新輪次與判定（尊重過濾）", () => {
    const d = newDir();
    writeAt(
      d,
      "viewer_02_demo_zc.md",
      `---\nrole: viewer\niteration: 2\ndepends_on: []\ntarget_files: []\nverdict: approve\n---\n\nok`,
      "2026-01-01T00:00:00Z",
    );
    const status = chainStatus(d);
    expect(status).toContain("viewer 第 2 輪 · approve");
    expect(status).toContain("coder  —");
    // since 之後無報告 → 全部待命
    const standby = chainStatus(d, { since: Date.parse("2026-06-01") });
    expect(standby).toContain("viewer —");
  });
});

describe("runWatcher", () => {
  it("--once：渲染一次即返回，顯示現在最新（含 match 過濾）", () => {
    const d = newDir();
    writeAt(d, "tester_01_任務甲_mock.md", CODER_REPORT.replace(/role: coder/, "role: tester").replace(/verdict: na/, "verdict: pass"), "2026-01-01T00:00:00Z");
    const panels: string[] = [];
    runWatcher("tester", d, { once: true, write: (p) => panels.push(p) });
    expect(panels).toHaveLength(1);
    expect(panels[0]).toContain("Khuimeng WATCH · TESTER");
    expect(panels[0]).toContain("任務甲");

    const filtered: string[] = [];
    runWatcher("tester", d, { once: true, match: "不存在", write: (p) => filtered.push(p) });
    expect(filtered[0]).toContain("待命中");
  });

  it("對真實 reports/pipeline 也可渲染（不空拋）", () => {
    const panels: string[] = [];
    runWatcher("coder", resolve(root, "reports/pipeline"), { once: true, write: (p) => panels.push(p) });
    expect(panels).toHaveLength(1);
  });
});
