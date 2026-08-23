import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface AgentRole {
  name: string;      // e.g. "socrates"
  file: string;      // path to agents/*.md
  systemPrompt: string; // parsed from markdown
}

export function loadRole(name: string, agentsDir = "agents"): string {
  const file = resolve(agentsDir, `${name}.md`);
  return readFileSync(file, "utf-8");
}

export function parseRoleMarkdown(raw: string, name: string): AgentRole {
  return {
    name,
    file: `${name}.md`,
    systemPrompt: raw,
  };
}