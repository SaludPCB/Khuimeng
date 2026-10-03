import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { ProviderName } from "../llm/types";

export interface SeatConfig {
  provider: ProviderName;
  model: string;
  reasoning_mode?: string;
  system_prompt_file?: string;
}

export interface PipelineConfig {
  mode: string; // "report_chain"
  max_iterations: number; // 退回重做上限，超限熔斷轉人工
  consensus_threshold?: number | null;
}

export interface SeatsConfig {
  seats: Record<string, SeatConfig>;
  pipeline: PipelineConfig;
  fallback: SeatConfig;
}

export function loadSeats(configPath = "configs/seats.yaml"): SeatsConfig {
  const file = readFileSync(resolve(configPath), "utf-8");
  const config = parse(file) as SeatsConfig;
  if (!config.seats || typeof config.seats !== "object") {
    throw new Error(`seats.yaml 缺少 seats 區塊: ${configPath}`);
  }
  if (
    !config.pipeline ||
    config.pipeline.mode !== "report_chain" ||
    typeof config.pipeline.max_iterations !== "number"
  ) {
    throw new Error(
      `seats.yaml 缺少 pipeline 區塊（mode: report_chain + max_iterations）: ${configPath}`,
    );
  }
  return config;
}
