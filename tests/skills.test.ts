import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadSkills, renderSkillsPrompt, skillsForRole } from "../src/agent/skills";
import { executeCommand, type TuiContext } from "../src/tui/commands";
import { loadSeats } from "../src/agent/seat-loader";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
let tmp = "";

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function writeSkill(dir: string, name: string, front: string, body: string): void {
  mkdirSync(resolve(dir, name), { recursive: true });
  writeFileSync(resolve(dir, name, "SKILL.md"), `---\n${front}\n---\n\n${body}`);
}

describe("skills 載入器", () => {
  it("解析 frontmatter（name/description/roles）與本文", () => {
    tmp = resolve(tmpdir(), `khuimeng-sk-${Date.now()}`);
    writeSkill(tmp, "my-skill", 'name: my-skill\ndescription: 測試技能\nroles:\n  - tester', "# 內容\n規則一");
    const skills = loadSkills(tmp);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "my-skill",
      description: "測試技能",
      roles: ["tester"],
    });
    expect(skills[0]?.body).toContain("規則一");
  });

  it("roles 未指定＝全部角色；目錄名 fallback 為 name；壞檔略過；無目錄回空", () => {
    tmp = resolve(tmpdir(), `khuimeng-sk2-${Date.now()}`);
    writeSkill(tmp, "fallback-name", "description: 通用", "body");
    const skills = loadSkills(tmp);
    expect(skills[0]?.name).toBe("fallback-name");
    expect(skillsForRole(skills, "viewer")).toHaveLength(1);
    expect(loadSkills(resolve(tmp, "不存在"))).toHaveLength(0);
  });

  it("skillsForRole 過濾 + renderSkillsPrompt 組裝", () => {
    tmp = resolve(tmpdir(), `khuimeng-sk3-${Date.now()}`);
    writeSkill(tmp, "for-tester", "roles:\n  - tester\ndescription: d1", "T-body");
    writeSkill(tmp, "for-all", "description: d2", "A-body");
    const skills = loadSkills(tmp);
    expect(skillsForRole(skills, "coder").map((s) => s.name)).toEqual(["for-all"]);
    expect(skillsForRole(skills, "tester").map((s) => s.name).sort()).toEqual(["for-all", "for-tester"]);
    const prompt = renderSkillsPrompt(skillsForRole(skills, "coder"));
    expect(prompt).toContain("# Skills");
    expect(prompt).toContain("A-body");
    expect(prompt).not.toContain("T-body");
    expect(renderSkillsPrompt([])).toBe("");
  });

  it("隨附的兩個官方 skill 可載入", () => {
    const skills = loadSkills(resolve(root, "skills"));
    expect(skills.map((s) => s.name)).toContain("testing-discipline");
    expect(skillsForRole(skills, "tester").length).toBeGreaterThanOrEqual(2);
  });
});

describe("/skills 指令", () => {
  it("列出已載入 skill", async () => {
    tmp = resolve(tmpdir(), `khuimeng-sk4-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    const ctx: TuiContext = {
      mock: true,
      seats: loadSeats(resolve(root, "configs/seats.yaml")),
      agentsDir: resolve(root, "agents"),
      reportsDir: tmp,
      sessionsDir: resolve(tmp, "s"),
      session: { name: "s" },
      repoRoot: root,
      approvalMode: "auto",
      messages: [],
      chat: [],
      emit: () => {},
      busy: () => {},
      exit: () => {},
    };
    await executeCommand(ctx, "/skills");
    const out = ctx.messages.at(-1)?.text ?? "";
    expect(out).toContain("testing-discipline");
    expect(out).toContain("repo-conventions");
  });
});
