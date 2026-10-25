import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeFileTools } from "../src/tools/file-tools";
import { ApprovalGate } from "../src/tools/approval";
import { parseToolBlocks, runAgentLoop } from "../src/tools/agent-loop";

let base = "";

afterEach(() => {
  if (base) rmSync(base, { recursive: true, force: true });
});

function dirs(): { sandboxDir: string; repoRoot: string } {
  base = resolve(
    tmpdir(),
    `khuimeng-ft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const sandboxDir = resolve(base, "sb");
  const repoRoot = resolve(base, "repo");
  mkdirSync(sandboxDir, { recursive: true });
  mkdirSync(repoRoot, { recursive: true });
  writeFileSync(resolve(repoRoot, "repo-file.txt"), "repo content");
  return { sandboxDir, repoRoot };
}

describe("file-tools（沙箱圍欄）", () => {
  it("寫入沙箱內＋讀回＋列表", () => {
    const { sandboxDir } = dirs();
    const f = makeFileTools({ sandboxDir });
    f.write("src/a.txt", "hello");
    expect(f.read("src/a.txt")).toContain("hello");
    expect(f.list(".")).toContain("d src");
  });

  it("路徑跳脫沙箱 → 拒絕", () => {
    const { sandboxDir } = dirs();
    const f = makeFileTools({ sandboxDir });
    expect(() => f.write("../escape.txt", "x")).toThrow("跳脫");
    expect(() => f.read("/etc/passwd")).toThrow();
  });

  it("禁區：.env* 與 node_modules", () => {
    const { sandboxDir } = dirs();
    const f = makeFileTools({ sandboxDir });
    expect(() => f.write(".env", "x")).toThrow("禁區");
    expect(() => f.write("node_modules/pkg/index.js", "x")).toThrow("禁區");
  });

  it("單檔上限 1MB", () => {
    const { sandboxDir } = dirs();
    const f = makeFileTools({ sandboxDir });
    expect(() => f.write("big.txt", "x".repeat(1024 * 1024 + 1))).toThrow("上限");
  });

  it("讀取回退主倉（[repo] 標記）", () => {
    const { sandboxDir, repoRoot } = dirs();
    const f = makeFileTools({ sandboxDir, repoRoot });
    const out = f.read("repo-file.txt");
    expect(out).toContain("[repo]");
    expect(out).toContain("repo content");
  });
});

describe("ApprovalGate（三段權限）", () => {
  it("auto：全部放行", async () => {
    const g = new ApprovalGate({ mode: "auto" });
    expect(await g.decide({ op: "write_file", detail: "x" })).toBe(true);
    expect(await g.decide({ op: "read_file", detail: "x" })).toBe(true);
  });

  it("semi：讀自動、寫要問", async () => {
    const asked: string[] = [];
    const g = new ApprovalGate({
      mode: "semi",
      ask: async (req) => {
        asked.push(req.op);
        return "yes";
      },
    });
    expect(await g.decide({ op: "read_file", detail: "r" })).toBe(true);
    expect(asked).toHaveLength(0);
    expect(await g.decide({ op: "write_file", detail: "w" })).toBe(true);
    expect(asked).toEqual(["write_file"]);
  });

  it("ask + 無詢問函（批次）→ fail-closed 拒寫", async () => {
    const g = new ApprovalGate({ mode: "ask" });
    expect(await g.decide({ op: "write_file", detail: "w" })).toBe(false);
  });

  it("always：同類永放且不再問", async () => {
    let asked = 0;
    const g = new ApprovalGate({
      mode: "semi",
      ask: async () => {
        asked += 1;
        return "always";
      },
    });
    expect(await g.decide({ op: "write_file", detail: "a" })).toBe(true);
    expect(await g.decide({ op: "write_file", detail: "b" })).toBe(true);
    expect(asked).toBe(1);
  });

  it("no：拒絕", async () => {
    const g = new ApprovalGate({ mode: "semi", ask: async () => "no" });
    expect(await g.decide({ op: "write_file", detail: "w" })).toBe(false);
  });
});

describe("agent-loop（文字工具協定）", () => {
  it("parseToolBlocks：三種操作解析", () => {
    const reply = [
      "前置說明",
      "<<<TOOL write_file path=cube.html",
      "<!DOCTYPE html>",
      "TOOL>>>",
      "<<<TOOL read_file path=src/a.ts",
      "TOOL>>>",
      "<<<TOOL list_files path=.",
      "TOOL>>>",
    ].join("\n");
    const calls = parseToolBlocks(reply);
    expect(calls).toEqual([
      { op: "write_file", path: "cube.html", cmd: "", content: "<!DOCTYPE html>" },
      { op: "read_file", path: "src/a.ts", cmd: "", content: "" },
      { op: "list_files", path: ".", cmd: "", content: "" },
    ]);
  });

  it("runAgentLoop：工具回合→最終報告；檔案真的落地", async () => {
    const { sandboxDir } = dirs();
    const f = makeFileTools({ sandboxDir });
    const gate = new ApprovalGate({ mode: "auto" });
    const replies = [
      '<<<TOOL write_file path=hello.txt\n世界\nTOOL>>>\n我再看看',
      "---\nrole: coder\niteration: 1\ndepends_on: []\ntarget_files: []\nverdict: na\n---\n\n# 報告\n完成",
    ];
    const agent = {
      speak: async (transcript: unknown) => {
        void transcript;
        return replies.shift() ?? "";
      },
    } as unknown as import("../src/agent/base-agent").BaseAgent;

    const final = await runAgentLoop(agent, {
      initialUser: "做一件事",
      file: f,
      gate,
    });
    expect(final).toContain("---");
    expect(f.read("hello.txt")).toContain("世界");
  });

  it("拒絕權限時結果回饋錯誤且不落地", async () => {
    const { sandboxDir } = dirs();
    const f = makeFileTools({ sandboxDir });
    const gate = new ApprovalGate({ mode: "semi", ask: async () => "no" });
    const replies = [
      '<<<TOOL write_file path=nope.txt\nx\nTOOL>>>',
      "---\nrole: coder\niteration: 1\ndepends_on: []\ntarget_files: []\nverdict: na\n---\n\nok",
    ];
    const agent = {
      speak: async () => replies.shift() ?? "",
    } as unknown as import("../src/agent/base-agent").BaseAgent;
    await runAgentLoop(agent, { initialUser: "go", file: f, gate });
    expect(f.list(".")).not.toContain("nope.txt");
  });

  it("maxSteps 超限熔斷", async () => {
    const { sandboxDir } = dirs();
    const f = makeFileTools({ sandboxDir });
    const gate = new ApprovalGate({ mode: "auto" });
    const agent = {
      speak: async () => '<<<TOOL list_files path=.\nTOOL>>>',
    } as unknown as import("../src/agent/base-agent").BaseAgent;
    await expect(
      runAgentLoop(agent, { initialUser: "go", file: f, gate, maxSteps: 3 }),
    ).rejects.toThrow("上限");
  });
});
