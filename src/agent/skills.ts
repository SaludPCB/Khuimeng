import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Skill 系統：skills/<name>/SKILL.md 的 Markdown 技能說明書。
 * frontmatter：name（可省，取目錄名）/ description / roles（可省＝全部角色）。
 * 載入後依角色注入 system prompt——「更多 Markdown」與本專案哲學同構。
 */

export interface Skill {
  name: string;
  description: string;
  /** 適用角色；未指定＝全部 */
  roles?: string[];
  body: string;
  file: string;
}

export function loadSkills(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) return [];
  const skills: Skill[] = [];
  let dirEntries: string[] = [];
  try {
    dirEntries = readdirSync(skillsDir);
  } catch {
    return [];
  }
  for (const entryName of dirEntries) {
    const isDir = (() => {
      try {
        return statSync(resolve(skillsDir, entryName)).isDirectory();
      } catch {
        return false;
      }
    })();
    if (!isDir) continue;
    const file = resolve(skillsDir, entryName, "SKILL.md");
    if (!existsSync(file)) continue;
    try {
      skills.push(parseSkillFile(file, entryName));
    } catch {
      // 壞檔略過——skill 不應弄掛主流程
    }
  }
  return skills;
}

function parseSkillFile(file: string, dirname: string): Skill {
  const raw = readFileSync(file, "utf-8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const body = (m?.[2] ?? raw).trim();
  let front: Record<string, unknown> = {};
  if (m?.[1]) {
    try {
      front = parse(m[1]) as Record<string, unknown>;
    } catch {
      front = {};
    }
  }
  const roles = Array.isArray(front.roles)
    ? (front.roles as string[]).map(String)
    : undefined;
  return {
    name: typeof front.name === "string" && front.name ? front.name : dirname,
    description: typeof front.description === "string" ? front.description : "",
    roles,
    body,
    file,
  };
}

export function skillsForRole(skills: Skill[], role: string): Skill[] {
  return skills.filter((s) => !s.roles || s.roles.includes(role));
}

/** 組成要附加到 system prompt 的區塊 */
export function renderSkillsPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const blocks = skills.map(
    (s) => `## Skill: ${s.name}\n${s.description}\n\n${s.body}`,
  );
  return `\n\n# Skills（技能說明書——依指示執行）\n\n${blocks.join("\n\n")}`;
}
