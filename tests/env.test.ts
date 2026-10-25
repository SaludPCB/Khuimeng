import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvIfPresent } from "../src/dotenv-lite";

let dir = "";

afterEach(() => {
  delete process.env.KHUI_ENV_TEST_A;
  delete process.env.KHUI_ENV_TEST_B;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("dotenv-lite", () => {
  it("載入 KEY=VALUE；註解/空行/格式錯誤忽略；引號剝除", () => {
    dir = resolve(tmpdir(), `khuimeng-env-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, ".env");
    writeFileSync(
      file,
      [
        "# 註解",
        "",
        "KHUI_ENV_TEST_A=hello",
        'KHUI_ENV_TEST_B="quoted value"',
        "MALFORMED_LINE_NO_EQ",
        "=NO_KEY",
      ].join("\n"),
    );
    const n = loadEnvIfPresent(file);
    expect(n).toBe(2);
    expect(process.env.KHUI_ENV_TEST_A).toBe("hello");
    expect(process.env.KHUI_ENV_TEST_B).toBe("quoted value");
  });

  it("已存在的環境變數不被覆蓋（export 優先）", () => {
    dir = resolve(tmpdir(), `khuimeng-env2-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = resolve(dir, ".env");
    process.env.KHUI_ENV_TEST_A = "from-export";
    writeFileSync(file, "KHUI_ENV_TEST_A=from-file\n");
    loadEnvIfPresent(file);
    expect(process.env.KHUI_ENV_TEST_A).toBe("from-export");
  });

  it("檔案不存在安靜跳過", () => {
    expect(loadEnvIfPresent(resolve(tmpdir(), "definitely-not-here-1234.env"))).toBe(0);
  });
});
