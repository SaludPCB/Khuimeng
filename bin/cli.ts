#!/usr/bin/env node
import { resolve } from "node:path";
import { createRegistry } from "../src/llm/factory";
import { loadSeats } from "../src/agent/seat-loader";
import { ReportPipeline } from "../src/pipeline/report-pipeline";

// Khuimeng 報告管道 CLI
//   npm start -- "議題"           real 模式（三席位各需對應 API key）
//   npm start -- --mock "議題"    mock 模式（免 API key，模擬報告跑通全鏈）

const args = process.argv.slice(2);
const mock = args.includes("--mock") || args.includes("--dry-run");
const topic =
  args.filter((a) => !a.startsWith("--")).join(" ") || "AI 是否會取代軟體工程師？";

const root = resolve(import.meta.dirname, "..");
const seats = loadSeats(resolve(root, "configs/seats.yaml"));
const registry = mock ? undefined : createRegistry();

console.log(`Khuimeng 報告管道 | 模式: ${mock ? "mock（免 API key）" : "real"} | 議題: ${topic}`);

const pipeline = new ReportPipeline({
  seats,
  registry,
  mock,
  agentsDir: resolve(root, "agents"),
  reportsDir: resolve(root, "reports/pipeline"),
  log: (line) => console.log(line),
});

const result = await pipeline.run(topic);

if (result.status === "delivered") {
  console.log("✅ 雙門檻通過（viewer approve ＋ tester pass），任務交付。");
} else {
  console.log("⛔ 熔斷：轉人工裁決。");
  process.exitCode = 1;
}
