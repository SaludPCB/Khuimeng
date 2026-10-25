import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSeats } from "../src/agent/seat-loader";
import { ReportPipeline } from "../src/pipeline/report-pipeline";
import { listSandboxes, pruneSandbox } from "../src/tools/sandbox";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let repo = "";
let created: string[] = [];

beforeEach(() => {
  repo = resolve(
    tmpdir(),
    `khuimeng-psbx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(repo, { recursive: true });
  const git = (a: string) =>
    execSync(`git -c user.name=t -c user.email=t@t ${a}`, { cwd: repo, encoding: "utf-8" });
  git("init -q -b main");
  execSync(`cp ${resolve(root, "configs/seats.yaml")} ${resolve(repo, "seats.yaml")}`);
  execSync(
    `mkdir -p ${resolve(repo, "agents")} && cp ${root}/agents/coder.md ${root}/agents/viewer.md ${root}/agents/tester.md ${resolve(repo, "agents")}/`,
  );
  git("add -A");
  git("commit -q -m init");
});

afterEach(() => {
  for (const id of created) {
    try {
      pruneSandbox(repo, id);
    } catch {
      // 已清理
    }
  }
  if (repo) rmSync(repo, { recursive: true, force: true });
});

describe("ReportPipeline × 沙箱（mock e2e）", () => {
  it("mock＋sandbox：交付物真的落地 worktree，結果帶沙箱資訊", async () => {
    const pipeline = new ReportPipeline({
      seats: loadSeats(resolve(repo, "seats.yaml")),
      mock: true,
      agentsDir: resolve(repo, "agents"),
      reportsDir: resolve(repo, "reports", "pipeline"),
      sandbox: true,
      repoRoot: repo,
      approval: { mode: "auto" },
    });
    const result = await pipeline.run("沙箱演示");
    expect(result.status).toBe("delivered");
    expect(result.sandbox?.id).toBeTruthy();
    created.push(result.sandbox!.id);
    const deliverable = resolve(result.sandbox!.dir, "mock-deliverable.txt");
    expect(existsSync(deliverable)).toBe(true);
    expect(readFileSync(deliverable, "utf-8")).toContain("沙箱演示");
    expect(listSandboxes(repo).map((x) => x.id)).toContain(result.sandbox!.id);
  });

  it("無 sandbox：結果不帶沙箱欄位（回歸）", async () => {
    const pipeline = new ReportPipeline({
      seats: loadSeats(resolve(repo, "seats.yaml")),
      mock: true,
      agentsDir: resolve(repo, "agents"),
      reportsDir: resolve(repo, "reports", "pipeline"),
      repoRoot: repo,
    });
    const result = await pipeline.run("無沙箱回歸");
    expect(result.status).toBe("delivered");
    expect(result.sandbox).toBeUndefined();
  });
});
