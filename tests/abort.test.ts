import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeFileTools } from "../src/tools/file-tools";
import { ApprovalGate } from "../src/tools/approval";
import { runAgentLoop } from "../src/tools/agent-loop";
import type { BaseAgent } from "../src/agent/base-agent";

let dir = "";
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function abortError(): Error {
  return Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}

describe("中途取消（ESC → AbortSignal 貫通）", () => {
  it("signal 傳入 speak；生成中 abort → AbortError 上拋", async () => {
    dir = resolve(tmpdir(), `khuimeng-abort-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const controller = new AbortController();
    const seen: Array<AbortSignal | undefined> = [];
    const agent = {
      speak: async (_t: unknown, signal?: AbortSignal) => {
        seen.push(signal);
        if (signal?.aborted) throw abortError();
        controller.abort(); // 模擬使用者在生成期間按 ESC
        throw abortError();
      },
    } as unknown as BaseAgent;

    await expect(
      runAgentLoop(agent, {
        initialUser: "go",
        file: makeFileTools({ sandboxDir: dir }),
        gate: new ApprovalGate({ mode: "auto" }),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(seen[0]).toBe(controller.signal);
  });

  it("未取消時 signal 照樣傳遞（不影響正常流）", async () => {
    dir = resolve(tmpdir(), `khuimeng-abort2-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const controller = new AbortController();
    let got: AbortSignal | undefined;
    const agent = {
      speak: async (_t: unknown, signal?: AbortSignal) => {
        got = signal;
        return "---\nrole: coder\niteration: 1\ndepends_on: []\ntarget_files: []\nverdict: na\n---\n\nok";
      },
    } as unknown as BaseAgent;
    const out = await runAgentLoop(agent, {
      initialUser: "go",
      file: makeFileTools({ sandboxDir: dir }),
      gate: new ApprovalGate({ mode: "auto" }),
      signal: controller.signal,
    });
    expect(out).toContain("---");
    expect(got).toBe(controller.signal);
  });
});
