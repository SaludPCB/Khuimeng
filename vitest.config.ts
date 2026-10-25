import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 測試斷言以繁中字串寫成——固定語系，避免隨系統 locale 飄移
    setupFiles: ["tests/setup.ts"],
    exclude: ["**/node_modules/**", ".khuimeng/**", "legacy/**"],
  },
});
