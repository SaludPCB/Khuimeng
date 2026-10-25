import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";

/**
 * 檔案手：受沙箱圍欄管轄的讀/寫/列。
 * 寫：僅限沙箱目錄內；禁 .env*；單檔上限 1MB。
 * 讀：沙箱內全開＋主倉唯讀窗口；禁 .env*、node_modules；輸出上限 256KB。
 */

const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_READ_CHARS = 256 * 1024;
const MAX_LIST_ENTRIES = 200;

function assertInside(root: string, rel: string): string {
  const p = resolve(root, rel);
  if (p !== root && !p.startsWith(root + sep)) {
    throw new Error(`路徑跳脫沙箱: ${rel}`);
  }
  return p;
}

function assertAllowedPath(rel: string): void {
  const norm = rel.replace(/\\/g, "/");
  if (/(^|\/)\.env(\.|$)/.test(norm)) {
    throw new Error(`禁區檔案: ${norm}（金鑰）`);
  }
  if (/(^|\/)node_modules(\/|$)/.test(norm)) {
    throw new Error(`禁區目錄: ${norm}`);
  }
}

export interface FileToolsOptions {
  /** 寫入根（沙箱目錄） */
  sandboxDir: string;
  /** 唯讀參照根（主倉）— read_file 找不到沙箱檔時可回退讀主倉 */
  repoRoot?: string;
}

export interface FileWriteResult {
  path: string;
  bytes: number;
}

export function makeFileTools(opts: FileToolsOptions) {
  const sandboxDir = resolve(opts.sandboxDir);
  const repoRoot = opts.repoRoot ? resolve(opts.repoRoot) : undefined;

  return {
    write(rel: string, content: string): FileWriteResult {
      assertAllowedPath(rel);
      const p = assertInside(sandboxDir, rel);
      const bytes = Buffer.byteLength(content, "utf-8");
      if (bytes > MAX_WRITE_BYTES) {
        throw new Error(`單檔上限 ${MAX_WRITE_BYTES} bytes，實際 ${bytes}`);
      }
      mkdirSync(resolve(p, ".."), { recursive: true });
      writeFileSync(p, content, "utf-8");
      return { path: rel, bytes };
    },

    read(rel: string): string {
      assertAllowedPath(rel);
      const inSandbox = assertInside(sandboxDir, rel);
      let p = inSandbox;
      let scope = "sandbox";
      try {
        statSync(inSandbox);
      } catch {
        if (!repoRoot) throw new Error(`找不到檔案: ${rel}`);
        p = assertInside(repoRoot, rel);
        scope = "repo";
      }
      const content = readFileSync(p, "utf-8");
      if (content.length > MAX_READ_CHARS) {
        return `${content.slice(0, MAX_READ_CHARS)}\n…（截斷，共 ${content.length} 字元）`;
      }
      return `[${scope}] ${rel}\n${content}`;
    },

    list(rel = "."): string {
      const base = assertInside(sandboxDir, rel);
      let names: string[] = [];
      try {
        names = readdirSync(base);
      } catch {
        return `(無法列出: ${rel})`;
      }
      const prefix = rel === "." || rel === "" ? "" : `${rel.replace(/\/$/, "")}/`;
      const lines: string[] = [];
      for (const name of names.slice(0, MAX_LIST_ENTRIES)) {
        const full = resolve(base, name);
        let tag = "f";
        try {
          if (statSync(full).isDirectory()) tag = "d";
        } catch {
          tag = "?";
        }
        lines.push(`${tag} ${prefix}${name}`);
      }
      if (names.length > MAX_LIST_ENTRIES) {
        lines.push(`…（共 ${names.length} 項，僅列前 ${MAX_LIST_ENTRIES}）`);
      }
      return lines.join("\n") || "(空)";
    },
  };
}

export type FileTools = ReturnType<typeof makeFileTools>;
