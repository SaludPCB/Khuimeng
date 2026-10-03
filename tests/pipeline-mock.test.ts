import { readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadSeats } from "../src/agent/seat-loader";
import { parseReport, ReportPipeline } from "../src/pipeline/report-pipeline";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let reportsDir = "";

afterEach(() => {
  if (reportsDir) rmSync(reportsDir, { recursive: true, force: true });
});

function makePipeline(
  logs: string[] = [],
  overrides: { maxIterations?: number; reportsDir?: string } = {},
): ReportPipeline {
  reportsDir =
    overrides.reportsDir ??
    resolve(
      tmpdir(),
      `khuimeng-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
  return new ReportPipeline({
    seats: loadSeats(resolve(root, "configs/seats.yaml")),
    mock: true,
    agentsDir: resolve(root, "agents"),
    reportsDir,
    maxIterations: overrides.maxIterations,
    log: (line) => logs.push(line),
  });
}

describe("ReportPipeline（mock 冒煙）：端到端全鏈", () => {
  it("mock 全鏈 delivered：含一次退回路由，5 份報告落盤且可回解析", async () => {
    const logs: string[] = [];
    const result = await makePipeline(logs).run("冒煙測試議題");

    expect(result.status).toBe("delivered");
    expect(result.steps.map((s) => `${s.role}#${s.iteration}:${s.verdict}`)).toEqual([
      "coder#1:na",
      "viewer#1:request_changes",
      "coder#2:na",
      "viewer#2:approve",
      "tester#2:pass",
    ]);
    expect(result.steps.at(-1)?.action).toBe("delivered");

    const files = readdirSync(reportsDir).sort();
    expect(files).toHaveLength(5);
    expect(files.every((f) => f.endsWith("_mock.md"))).toBe(true);

    const testerFile = files.find((f) => f.startsWith("tester_"))!;
    const tester = parseReport(readFileSync(resolve(reportsDir, testerFile), "utf-8"));
    expect(tester.fm.role).toBe("tester");
    expect(tester.fm.verdict).toBe("pass");
    expect(tester.fm.depends_on).toHaveLength(2);
  });

  it("maxIterations 覆寫為 1 時：viewer 第一次退回即熔斷", async () => {
    const result = await makePipeline([], { maxIterations: 1 }).run("熔斷覆寫議題");
    expect(result.status).toBe("circuit_break");
    expect(result.steps.map((s) => `${s.role}#${s.iteration}:${s.verdict}`)).toEqual([
      "coder#1:na",
      "viewer#1:request_changes",
    ]);
    expect(result.steps.at(-1)?.action).toBe("circuit_break");
  });

  it("maxIterations 非法值建構即拋錯", () => {
    expect(
      () =>
        new ReportPipeline({
          seats: loadSeats(resolve(root, "configs/seats.yaml")),
          mock: true,
          reportsDir,
          maxIterations: 0,
        }),
    ).toThrow(/max_iterations/);
  });

  it("角色檔指向錯誤時啟動即拋錯（frontmatter 校驗 fail-closed）", async () => {
    const seats = loadSeats(resolve(root, "configs/seats.yaml"));
    const bad = structuredClone(seats);
    bad.seats.viewer!.system_prompt_file = "agents/coder.md";
    const pipeline = new ReportPipeline({
      seats: bad,
      mock: true,
      agentsDir: resolve(root, "agents"),
      reportsDir,
    });
    await expect(pipeline.run("x")).rejects.toThrow(/frontmatter/);
  });
});
