import { describe, expect, it } from "vitest";
import { route } from "../src/pipeline/report-pipeline";

describe("route：verdict 驅動流向（雙門檻＋熔斷）", () => {
  it("coder 恆交 viewer", () => {
    expect(route("coder", "na", 1, 3, false)).toBe("to_viewer");
  });

  it("viewer approve 交 tester", () => {
    expect(route("viewer", "approve", 1, 3, false)).toBe("to_tester");
  });

  it("viewer request_changes 未達上限退回 coder", () => {
    expect(route("viewer", "request_changes", 1, 3, false)).toBe("back_to_coder");
    expect(route("viewer", "request_changes", 2, 3, false)).toBe("back_to_coder");
  });

  it("viewer request_changes 達上限熔斷", () => {
    expect(route("viewer", "request_changes", 3, 3, false)).toBe("circuit_break");
  });

  it("tester pass ＋ 當輪 viewer approve → delivered（雙門檻）", () => {
    expect(route("tester", "pass", 1, 3, true)).toBe("delivered");
  });

  it("tester pass 但缺 viewer approve 不放行（防禦）", () => {
    expect(route("tester", "pass", 1, 3, false)).toBe("back_to_coder");
  });

  it("tester blocked 未達上限退回、達上限熔斷", () => {
    expect(route("tester", "blocked", 2, 3, true)).toBe("back_to_coder");
    expect(route("tester", "blocked", 3, 3, true)).toBe("circuit_break");
  });
});
