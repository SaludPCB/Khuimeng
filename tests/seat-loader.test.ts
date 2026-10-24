import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSeats } from "../src/agent/seat-loader";
import { parseRoleMarkdown } from "../src/agent/role-loader";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

describe("loadSeats：真實 seats.yaml 消費", () => {
  it("三席映射＋pipeline 熔斷設定（nvidia 一 key 三模型）", () => {
    const s = loadSeats(resolve(root, "configs/seats.yaml"));
    expect(Object.keys(s.seats).sort()).toEqual(["coder", "tester", "viewer"]);
    expect(s.pipeline.mode).toBe("report_chain");
    expect(s.pipeline.max_iterations).toBe(3);
    // 三席同供應商、三個不同模型家族（llama／qwen／deepseek）
    for (const role of ["coder", "viewer", "tester"] as const) {
      expect(s.seats[role]?.provider).toBe("nvidia");
      expect(s.seats[role]?.system_prompt_file).toBe(`agents/${role}.md`);
    }
    const models = ["coder", "viewer", "tester"].map((r) => s.seats[r]!.model);
    // 目錄實測（2026-10-24）：寫手 DeepSeek（思考開銷小）／審查驗收 MiniMax；寫手與審查跨家族
    expect(models[0]).toContain("deepseek");
    expect(models[1]).toContain("minimax");
    expect(models[2]).toContain("minimax");
    expect(s.fallback.provider).toBe("nvidia");
  });

  it("缺 pipeline 區塊 fail-closed", () => {
    const bad = resolve(tmpdir(), `bad-seats-${Date.now()}.yaml`);
    writeFileSync(bad, "seats:\n  coder: {provider: openai, model: x}\n");
    expect(() => loadSeats(bad)).toThrow(/pipeline/);
  });
});

describe("parseRoleMarkdown：角色檔 frontmatter 消費", () => {
  it("解析 agents/*.md 五欄，本文為 system prompt", () => {
    for (const role of ["coder", "viewer", "tester"] as const) {
      const raw = readFileSync(resolve(root, `agents/${role}.md`), "utf-8");
      const parsed = parseRoleMarkdown(raw, role);
      expect(parsed.frontmatter?.role).toBe(role);
      expect(parsed.frontmatter?.verdict).toBe("na");
      expect(parsed.systemPrompt).toContain(role === "coder" ? "實作工程師" : role === "viewer" ? "架構審查員" : "品質驗收員");
    }
  });
});
