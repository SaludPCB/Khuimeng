import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/** 角色定義檔的 YAML frontmatter 五欄（role/iteration/depends_on/target_files/verdict） */
export interface RoleFrontmatter {
  role?: string;
  iteration?: number;
  depends_on?: string[];
  target_files?: string[];
  verdict?: string;
}

export interface AgentRole {
  name: string; // e.g. "coder"
  file: string; // path to agents/*.md
  systemPrompt: string; // frontmatter 之後的本文
  frontmatter?: RoleFrontmatter;
}

export function loadRole(name: string, agentsDir = "agents"): string {
  const file = resolve(agentsDir, `${name}.md`);
  return readFileSync(file, "utf-8");
}

/** 解析角色定義檔：拆出 frontmatter 五欄與本文（本文作為 system prompt） */
export function parseRoleMarkdown(raw: string, name: string): AgentRole {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m || m[1] === undefined) {
    return { name, file: `${name}.md`, systemPrompt: raw.trim() };
  }
  return {
    name,
    file: `${name}.md`,
    systemPrompt: (m[2] ?? "").trim(),
    frontmatter: parse(m[1]) as RoleFrontmatter,
  };
}
