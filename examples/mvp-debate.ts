/**
 * Khuimeng MVP：三角色報告管道 mock 演練（免 API key）
 * 使用：npm run mvp -- "議題"
 * mock 模式以內建模擬報告跑通 Coder → Viewer → Tester 全鏈（含一次退回路由示範），
 * 真實執行請改用：npm start -- "議題"（三席位各需對應 API key）
 */
import { resolve } from "node:path";
import { loadSeats } from "../src/agent/seat-loader";
import { ReportPipeline } from "../src/pipeline/report-pipeline";

const topic = process.argv.slice(2).join(" ") || "開源 AI Agent 專案應該用哪種語言？";
const root = resolve(import.meta.dirname, "..");
const seats = loadSeats(resolve(root, "configs/seats.yaml"));

const pipeline = new ReportPipeline({
  seats,
  mock: true,
  agentsDir: resolve(root, "agents"),
  reportsDir: resolve(root, "reports/pipeline"),
  log: (line) => console.log(line),
});

const result = await pipeline.run(topic);
console.log(
  result.status === "delivered"
    ? "MVP mock 演練完成：報告已存 reports/pipeline/。"
    : "MVP mock 演練熔斷：轉人工裁決。",
);
