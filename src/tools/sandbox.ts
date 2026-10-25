import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 沙箱：git worktree 隔離練習房。
 * 任務在 .khuimeng/tasks/<id>（專屬資料夾＋專屬分支 khuimeng/<id>）內動手，
 * 主工作樹與 main 分支零風險；做壞 prune 整間拆，做好 merge 搬回主線。
 */

export interface SandboxInfo {
  id: string;
  dir: string;
  branch: string;
}

export interface SandboxSummary extends SandboxInfo {
  checkpoints: number;
  dirty: boolean;
}

const GIT_IDENTITY = [
  "-c",
  "user.name=khuimeng",
  "-c",
  "user.email=bot@khuimeng.local",
];

function git(args: string, cwd: string): string {
  try {
    return execSync(`git ${GIT_IDENTITY.join(" ")} ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = e as { stderr?: string | Buffer; message: string };
    const stderr = err.stderr ? err.stderr.toString() : err.message;
    throw new Error(`git ${args.split(" ")[0]} 失敗: ${stderr.slice(0, 200)}`);
  }
}

export function tasksRoot(repoRoot: string): string {
  return resolve(repoRoot, ".khuimeng", "tasks");
}

export function isGitRepo(repoRoot: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/** 建立練習房：worktree＋新分支（自 HEAD） */
export function createSandbox(repoRoot: string, slug = "task"): SandboxInfo {
  if (!isGitRepo(repoRoot)) {
    throw new Error(`${repoRoot} 不是 git 倉庫，沙箱需要 git worktree`);
  }
  const id = `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const dir = resolve(tasksRoot(repoRoot), id);
  const branch = `khuimeng/${id}`;
  mkdirSync(resolve(dir, ".."), { recursive: true });
  git(`worktree add -b ${branch} ${JSON.stringify(dir)}`, repoRoot);
  return { id, dir, branch };
}

function worktreeDir(repoRoot: string, id: string): string {
  const dir = resolve(tasksRoot(repoRoot), id);
  if (!existsSync(resolve(dir, ".git"))) {
    throw new Error(`沙箱不存在: ${id}`);
  }
  return dir;
}

/** 列出所有沙箱（含檢查點數與工作區狀態） */
export function listSandboxes(repoRoot: string): SandboxSummary[] {
  const root = tasksRoot(repoRoot);
  let ids: string[] = [];
  try {
    ids = readdirSync(root);
  } catch {
    return [];
  }
  const out: SandboxSummary[] = [];
  for (const id of ids) {
    const dir = resolve(root, id);
    if (!existsSync(resolve(dir, ".git"))) continue;
    const log = git(`log --oneline --grep="^checkpoint:"`, dir);
    const status = git("status --porcelain", dir);
    out.push({
      id,
      dir,
      branch: `khuimeng/${id}`,
      checkpoints: log ? log.split("\n").length : 0,
      dirty: status.length > 0,
    });
  }
  return out;
}

/** 檢查點：把練習房全部變更 commit 起來（--allow-empty 容許空點） */
export function checkpoint(repoRoot: string, id: string, label = ""): void {
  const dir = worktreeDir(repoRoot, id);
  git("add -A", dir);
  git(`commit --allow-empty -m "checkpoint: ${label || new Date().toISOString()}"`, dir);
}

/** 回滾：退回 N 個檢查點（預設 1；只動練習房） */
export function rollback(repoRoot: string, id: string, n = 1): void {
  const dir = worktreeDir(repoRoot, id);
  if (!Number.isInteger(n) || n < 1) throw new Error("rollback N 須為正整數");
  git(`reset --hard HEAD~${n}`, dir);
  git("clean -fd", dir);
}

/** 練習房現況：porcelain status + tracked diff + 未追蹤清單（餵給 Viewer） */
export function sandboxDiff(repoRoot: string, id: string): string {
  const dir = worktreeDir(repoRoot, id);
  const status = git("status --porcelain", dir);
  const diff = git("diff HEAD", dir);
  const parts = [`== status ==\n${status || "(clean)"}`];
  parts.push(`== diff (tracked) ==\n${diff || "(none)"}`);
  return parts.join("\n\n").slice(0, 8000);
}

/** 把練習房分支 merge 回目前分支（老闆親自按下的人肉門） */
export function mergeSandbox(repoRoot: string, id: string): string {
  const dir = worktreeDir(repoRoot, id);
  git("add -A", dir);
  git(`commit --allow-empty -m "sandbox: ${id}"`, dir);
  const out = git(`merge --no-edit khuimeng/${id}`, repoRoot);
  return out || "merged";
}

/** 拆房：移除 worktree＋分支（不可逆） */
export function pruneSandbox(repoRoot: string, id: string): void {
  const dir = worktreeDir(repoRoot, id);
  git(`worktree remove --force ${JSON.stringify(dir)}`, repoRoot);
  try {
    git(`branch -D khuimeng/${id}`, repoRoot);
  } catch {
    // 分支已被 merge 刪除等——忽略
  }
  rmSync(dir, { recursive: true, force: true });
}

/** 沙箱內唯一允許讀主倉的窗口：受 read 檔案工具管轄 */
export function sandboxReadRootFile(repoRoot: string, rel: string): string {
  const p = resolve(repoRoot, rel);
  if (!p.startsWith(resolve(repoRoot) + "/")) throw new Error("路徑跳脫沙箱規則");
  return readFileSync(p, "utf-8");
}
