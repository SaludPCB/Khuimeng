import { existsSync, readFileSync } from "node:fs";

/**
 * 零依賴 .env 載入器：KEY=VALUE 逐行解析（# 註解與空行忽略）。
 * 已存在的環境變數不覆蓋（export 優先於 .env）；檔案不存在則安靜跳過。
 */
export function loadEnvIfPresent(path: string): number {
  if (!existsSync(path)) return 0;
  let loaded = 0;
  for (const rawLine of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
      loaded += 1;
    }
  }
  return loaded;
}
