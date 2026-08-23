import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { ProviderName } from "../llm/types";

export interface SeatConfig {
  provider: ProviderName;
  model: string;
  reasoning_mode?: string;
}

export interface SeatsConfig {
  seats: Record<string, SeatConfig>;
  rules: {
    max_rounds: number;
    provider_spread_first?: boolean;
    force_counterfactual_if_consensus_gt?: number;
    require_dissenting_members?: number;
  };
  fallback: SeatConfig;
}

export function loadSeats(configPath = "configs/seats.yaml"): SeatsConfig {
  const file = readFileSync(resolve(configPath), "utf-8");
  return parse(file) as SeatsConfig;
}