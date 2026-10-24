import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  detectLang,
  getLang,
  parseLang,
  resolveRoleFile,
  setLang,
  t,
  type Lang,
} from "../src/i18n";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const SAVED = { ...process.env };

describe("i18n", () => {
  it("兩語字典鍵一致且插值生效", () => {
    setLang("zh-TW");
    expect(t("watchStandby")).toContain("待命");
    expect(t("chainRound", { n: 2, verdict: "pass" })).toContain("第 2 輪");
    setLang("en");
    expect(t("watchStandby")).toContain("Standby");
    expect(t("chainRound", { n: 2, verdict: "pass" })).toContain("round 2");
    expect(t("verdictDomain", { verdict: "x", role: "viewer", domain: "a/b" })).toContain(
      "not in viewer domain",
    );
    setLang("zh-TW");
  });

  it("parseLang：en/zh 解析與非法值", () => {
    expect(parseLang("en")).toBe("en");
    expect(parseLang("zh-TW")).toBe("zh-TW");
    expect(parseLang("zh_tw")).toBe("zh-TW");
    expect(parseLang("fr")).toBeNull();
  });

  it("detectLang：KHUIMENG_LANG 優先，其次系統 locale，預設英文", () => {
    const cases: Array<[Record<string, string>, Lang]> = [
      [{ KHUIMENG_LANG: "en" }, "en"],
      [{ KHUIMENG_LANG: "zh-TW" }, "zh-TW"],
      [{ LANG: "zh_TW.UTF-8" }, "zh-TW"],
      [{ LANG: "en_US.UTF-8" }, "en"],
      [{ LANG: "C.UTF-8" }, "en"],
    ];
    for (const [env, want] of cases) {
      process.env.KHUIMENG_LANG = env.KHUIMENG_LANG;
      process.env.LANG = env.LANG;
      delete process.env.LC_ALL;
      expect(detectLang()).toBe(want);
    }
    process.env.KHUIMENG_LANG = SAVED.KHUIMENG_LANG;
    process.env.LANG = SAVED.LANG;
    setLang("zh-TW");
  });

  it("resolveRoleFile：英文模式切 *.en.md（存在時），中文模式原樣", () => {
    const zh = resolve(root, "agents/coder.md");
    setLang("zh-TW");
    expect(resolveRoleFile(zh)).toBe(zh);
    setLang("en");
    expect(resolveRoleFile(zh)).toBe(resolve(root, "agents/coder.en.md"));
    setLang("zh-TW");
  });

  it("英文角色檔三份存在且 frontmatter 合法", async () => {
    const { parseRoleMarkdown } = await import("../src/agent/role-loader");
    const { readFileSync } = await import("node:fs");
    for (const role of ["coder", "viewer", "tester"] as const) {
      const raw = readFileSync(resolve(root, `agents/${role}.en.md`), "utf-8");
      const parsed = parseRoleMarkdown(raw, role);
      expect(parsed.frontmatter?.role).toBe(role);
      expect(parsed.frontmatter?.verdict).toBe("na");
      expect(parsed.systemPrompt.length).toBeGreaterThan(50);
    }
  });

  it("getLang 反映 setLang", () => {
    setLang("en");
    expect(getLang()).toBe("en");
    setLang("zh-TW");
    expect(getLang()).toBe("zh-TW");
  });
});
