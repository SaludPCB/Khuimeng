import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkpoint,
  createSandbox,
  isGitRepo,
  listSandboxes,
  mergeSandbox,
  pruneSandbox,
  rollback,
  sandboxDiff,
} from "../src/tools/sandbox";

let repo = "";

function git(args: string): string {
  return execSync(`git -c user.name=t -c user.email=t@t ${args}`, {
    cwd: repo,
    encoding: "utf-8",
  }).trim();
}

beforeEach(() => {
  repo = resolve(
    tmpdir(),
    `khuimeng-sbx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(repo, { recursive: true });
  git("init -q -b main");
  writeFileSync(resolve(repo, "README.md"), "# test\n");
  git("add -A");
  git("commit -q -m init");
});

afterEach(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

describe("sandbox（git worktree 練習房）", () => {
  it("isGitRepo", () => {
    expect(isGitRepo(repo)).toBe(true);
    expect(isGitRepo(tmpdir())).toBe(false);
  });

  it("create → 獨立目錄＋分支；主倉工作樹不受影響", () => {
    const sb = createSandbox(repo, "demo");
    expect(existsSync(resolve(sb.dir, "README.md"))).toBe(true);
    expect(existsSync(resolve(sb.dir, ".git"))).toBe(true);
    expect(existsSync(resolve(repo, "demo.txt"))).toBe(false);
    expect(listSandboxes(repo).map((x) => x.id)).toContain(sb.id);
  });

  it("checkpoint＋rollback：回到檢查點當時狀態（含未追蹤清理）", () => {
    const sb = createSandbox(repo);
    writeFileSync(resolve(sb.dir, "good.txt"), "v1");
    checkpoint(repo, sb.id, "r1");
    writeFileSync(resolve(sb.dir, "good.txt"), "v2-壞了");
    writeFileSync(resolve(sb.dir, "extra.txt"), "未追蹤垃圾");
    checkpoint(repo, sb.id, "r2");
    rollback(repo, sb.id, 1);
    const content = execSync(`cat ${resolve(sb.dir, "good.txt")}`, {
      encoding: "utf-8",
    });
    expect(content).toContain("v1");
    expect(existsSync(resolve(sb.dir, "extra.txt"))).toBe(false);
  });

  it("主倉 merge：練習房成果搬回主線", () => {
    const sb = createSandbox(repo);
    writeFileSync(resolve(sb.dir, "feature.txt"), "from sandbox");
    mergeSandbox(repo, sb.id);
    expect(existsSync(resolve(repo, "feature.txt"))).toBe(true);
  });

  it("sandboxDiff 反映變更；prune 整間拆掉＋分支刪除", () => {
    const sb = createSandbox(repo);
    writeFileSync(resolve(sb.dir, "new.txt"), "x");
    const diff = sandboxDiff(repo, sb.id);
    expect(diff).toContain("new.txt");
    pruneSandbox(repo, sb.id);
    expect(existsSync(sb.dir)).toBe(false);
    expect(listSandboxes(repo).map((x) => x.id)).not.toContain(sb.id);
  });

  it("listSandboxes 檢查點計數", () => {
    const sb = createSandbox(repo);
    checkpoint(repo, sb.id, "a");
    checkpoint(repo, sb.id, "b");
    const me = listSandboxes(repo).find((x) => x.id === sb.id);
    expect(me?.checkpoints).toBe(2);
  });
});
