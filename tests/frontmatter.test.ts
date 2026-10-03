import { describe, expect, it } from "vitest";
import { parseReport, validateFrontmatter } from "../src/pipeline/report-pipeline";

describe("validateFrontmatter：五欄校驗與值域鎖死", () => {
  const valid = {
    role: "coder",
    iteration: 1,
    depends_on: [],
    target_files: ["src/example.ts"],
    verdict: "na",
  };

  it("合法 coder frontmatter 通過", () => {
    const v = validateFrontmatter(valid);
    expect(v.ok).toBe(true);
  });

  it("viewer 只准 approve/request_changes", () => {
    expect(
      validateFrontmatter({ ...valid, role: "viewer", verdict: "approve" }).ok,
    ).toBe(true);
    expect(
      validateFrontmatter({ ...valid, role: "viewer", verdict: "pass" }).ok,
    ).toBe(false);
  });

  it("tester 只准 pass/blocked", () => {
    expect(
      validateFrontmatter({ ...valid, role: "tester", verdict: "blocked" }).ok,
    ).toBe(true);
    expect(
      validateFrontmatter({ ...valid, role: "tester", verdict: "approve" }).ok,
    ).toBe(false);
  });

  it("viewer 的 verdict 不得流入 tester 報告（跨值域即違約）", () => {
    const v = validateFrontmatter({ ...valid, role: "tester", verdict: "request_changes" });
    expect(v.ok).toBe(false);
  });

  it("非法角色被拒", () => {
    expect(validateFrontmatter({ ...valid, role: "moderator" }).ok).toBe(false);
  });

  it("iteration 須為正整數", () => {
    expect(validateFrontmatter({ ...valid, iteration: 0 }).ok).toBe(false);
    expect(validateFrontmatter({ ...valid, iteration: 1.5 }).ok).toBe(false);
  });

  it("depends_on／target_files 須為陣列", () => {
    expect(validateFrontmatter({ ...valid, depends_on: "coder_01" }).ok).toBe(false);
    expect(validateFrontmatter({ ...valid, target_files: undefined }).ok).toBe(false);
  });
});

describe("parseReport：--- 圍欄解析", () => {
  it("正常解析 frontmatter 與本文", () => {
    const md = `---
role: viewer
iteration: 2
depends_on: ["coder_02_x.md"]
target_files: []
verdict: approve
---

# Viewer 報告
內容`;
    const { fm, body } = parseReport(md);
    expect(fm.role).toBe("viewer");
    expect(fm.iteration).toBe(2);
    expect(fm.verdict).toBe("approve");
    expect(body).toContain("# Viewer 報告");
  });

  it("缺圍欄拋錯", () => {
    expect(() => parseReport("# 無 frontmatter")).toThrow("frontmatter");
  });

  it("圍欄內值域違約拋錯", () => {
    const md = `---
role: coder
iteration: 1
depends_on: []
target_files: []
verdict: approve
---
`;
    expect(() => parseReport(md)).toThrow("值域");
  });
});
