import { existsSync } from "node:fs";

export type Lang = "zh-TW" | "en";

const ZH = {
  banner: "Khuimeng 報告管道 v{version} | 模式: {mode} | 議題: {topic}",
  modeMock: "mock（免 API key）",
  modeReal: "real",
  delivered: "✅ 雙門檻通過（viewer approve ＋ tester pass），任務交付。",
  circuit: "⛔ 熔斷：轉人工裁決。",
  runFail: "⛔ 執行失敗：{msg}",
  errPrefix: "錯誤: {msg}",
  needPath: "{flag} 需要目錄路徑",
  needKeyword: "--match 需要關鍵字（任務 slug）",
  needFile: "{flag} 需要檔案路徑",
  needPositiveInt: "{flag} 需要正整數，實際: {value}",
  needSignature: "{flag} 需要署名",
  needLang: "--lang 需為 en 或 zh-TW",
  unknownFlag: "未知旗標: {flag}（--help 看說明）",
  taskFileReadFail: "任務書讀取失敗: {file}",
  taskFileEmpty: "任務書為空: {file}",
  defaultTopic: "AI 是否會取代軟體工程師？",
  extraWatchArg: "多餘參數 {arg}（watch 只吃一個角色）",
  watchNoFlag: "watch 不支援旗標 {flag}",
  watchRoleInvalid: "watch 角色須為 coder|viewer|tester，實際: {role}",
  notProvided: "（未提供）",
  watchStandby: "待命中…啟動後尚無新報告",
  watchFilterSuffix: "（過濾：{kw}）",
  watchLastLabel: "上次",
  watchLastSuffix: "（啟動前既有）",
  watchStatusTitle: "── 管線狀態 ",
  wFile: "檔案",
  wRound: "輪次",
  wVerdict: "判定",
  wDeps: "依賴",
  watchFooter: "（{time} 刷新；Ctrl+C 離開）",
  chainRound: "第 {n} 輪 · {verdict}",
  chainParseFail: "⚠ {file} 解析失敗",
  unsupportedMode: "不支援的 pipeline.mode: {mode}",
  missingSeat: "seats.yaml 缺少角色座席: {role}",
  needRegistry: "real 模式需要 registry（或改用 mock: true）",
  fmNotObject: "frontmatter 不是物件",
  roleInvalid: "role 非法: {role}",
  verdictDomain: "verdict \"{verdict}\" 不在 {role} 值域 [{domain}]",
  iterationInvalid: "iteration 須為正整數，實際: {value}",
  maxIterInvalid: "max_iterations 須為正整數，實際: {value}",
  keyArray: "{key} 須為陣列",
  fmInvalid: "frontmatter 校驗失敗: {errors}",
  fmMissingFence: "報告缺少 --- frontmatter 圍欄",
  logStart: "▶ 管道啟動（mode={mode}, max_iterations={max}, mock={mock}）",
  logStep: "  [{role} #{n}] verdict={verdict} → {action}（{file}）",
  logCircuitBreak: "⛔ 熔斷：退回次數達上限（{max}），轉人工裁決。",
  upstreamRejected: "（上一輪被退回，請依 Viewer／Tester 意見修改後重交，iteration={n}）",
  roleFileInvalid: "角色檢查失敗：{role} 定義檔 frontmatter 須 role={role}、verdict=na",
  providerNoKey: "供應商 {provider} 未設定 API key（請設定環境變數）或改用 --mock",
  providerNoKeyShort: "供應商 {provider} 未設定 API key 或改用 --mock",
  reportInstruction:
    "請依你的角色定義輸出 Markdown 報告。輸出格式（嚴格遵守）：\n第 1 行必須是 ---（之前不得有任何字元、問候、說明或程式碼圍欄）；\n接著 YAML frontmatter 五欄：role: {role}、iteration: {iteration}、depends_on: []、target_files: []、verdict: <值>；\n再一行 ---，之後才是報告本文。verdict 須落在你的值域 [{domain}]。",
  roleMismatch: "報告 role={got} 與預期 {want} 不符",
  iterMismatch: "報告 iteration={got} 與預期 {want} 不符",
  replyHead: "（模型回覆開頭：{head}）",
  seatNoSeats: "seats.yaml 缺少 seats 區塊: {path}",
  seatNoPipeline: "seats.yaml 缺少 pipeline 區塊（mode: report_chain + max_iterations）: {path}",
  streamNoContent: "{name} 串流結束但無正文內容",
  streamThinkBurn:
    "（思考耗 {chars} 字元，疑似燒盡 max_tokens={max}，請換非思考模型或提高額度）",
  tuiNonTty: "錯誤: tui 需要互動式終端機（Raw mode）——請直接在終端機執行，不要管線/重導向。",
  tuiWelcomeMock: "Khuimeng TUI（mock 模式）— 直接輸入訊息跟 Coder 對話；/help 看指令。",
  tuiWelcome: "Khuimeng TUI — 直接輸入訊息跟 Coder 對話；/help 看指令。",
  spinnerThinking: "{role}思考中…",
  statusHints: "↑↓ 歷史 · /help 指令",
  lblYou: "你",
  lblSystem: "系統",
  lblError: "錯誤",
  lblTask: "管道",
  tuiHelp: [
    "指令：",
    "  直接輸入訊息        與 Coder 對話（保留上下文）",
    "  /ask 角色 問題       指名問任一角色（三方會診，全員看得到對話）",
    "  /viewer            召喚 Viewer 審查當前 Coder 產出",
    "  /tester            召喚 Tester 驗收當前產出",
    '  /task "任務"       跑全自動管道（雙門檻＋熔斷）',
    "  /model 角色 模型ID  換席位模型（如 /model coder z-ai/glm-5.3-flash）",
    "  /seats             查看座位表",
    "  /reports           列最近報告",
    "  /provider 角色 供應商  熱切換 API（如 /provider coder openai）",
    "  /sessions          列已存 sessions",
    "  /resume <名稱>      續跑舊 session",
    "  /rename <名稱>      改名目前 session",
    "  /clear             清空對話",
    "  /exit              離開",
  ].join("\n"),
  seatUnavailable: "席位 {role} 的供應商不可用（缺 API key？）或改用 --mock",
  noChatYet: "尚無對話內容可審查——先跟 Coder 聊幾句再召喚 {role}。",
  metaVerdict: "verdict: {verdict} · 第 {n} 輪 · 已存 {file}",
  reportFail: "{role} 報告失敗：{msg}",
  coderFail: "Coder 回覆失敗：{msg}",
  taskUsage: '用法：/task "任務描述"',
  taskStart: "▶ 全自動管道啟動：{task}",
  modelRoleInvalid: "角色須為 coder|viewer|tester，如：/model coder z-ai/glm-5.3-flash",
  modelNeedId: "需提供模型 ID，如：/model coder z-ai/glm-5.3-flash",
  modelSwitched: "{role} 席模型已切換為 {model}（僅本 session 生效）",
  seatsTitle: "座位表：",
  reportsRecent: "最近報告（前 10）：",
  reportsNone: "（尚無報告）",
  cleared: "已清空對話。",
  unknownCmd: "未知指令：{name}（/help 看指令集）",
  providerUsage:
    "用法：/provider 角色 供應商 [base_url]，供應商：nvidia|openai|anthropic|google|deepseek",
  providerInvalid: "供應商須為 nvidia|openai|anthropic|google|deepseek",
  providerSwitched:
    "{role} 席供應商已切換為 {provider}（需環境變數 {env}；本 session 生效）",
  sessionsTitle: "已存 sessions（前 10）：",
  sessionsNone: "（尚無 session）",
  sessionLine: "  {name} · {turns} 輪 · {time}",
  sessionNotFound: "找不到 session「{name}」",
  sessionResumed: "已續跑 session「{name}」（{n} 輪對話）",
  sessionRenamed: "session 已改名為「{name}」",
  sessionNameInvalid: "名稱須為 1-32 字（中英文、數字、連字號）",
  sessionCurrent: "目前 session：{name}（自動存檔；/rename 改名、/resume 續跑別的）",
  askUsage: "用法：/ask coder|viewer|tester <問題>（直接打字＝問 Coder）",
  mockRoleReply:
    "（mock 模式）{role} 收到：「{text}」\n這是模擬回覆——real 模式下為 {role} 的真實回應。",
  toolSpec:
    "你可以使用檔案工具（沙箱內）：\n" +
    "寫入：先單獨一行 \"<<<TOOL write_file path=相對路徑\"，下一行起是完整檔案內容，最後單獨一行 \"TOOL>>>\"。\n" +
    "讀取：\"<<<TOOL read_file path=相對路徑\" 換行 \"TOOL>>>\"。\n" +
    "列表：\"<<<TOOL list_files path=.\" 換行 \"TOOL>>>\"。\n" +
    "規則：路徑一律相對於工作目錄；禁 .env* 與 node_modules；寫入單檔上限 1MB。工具結果會回饋給你；完成後輸出最終報告（第 1 行必須是 ---，不得再含工具區塊）。",
  sandboxCreated: "📁 沙箱已建立：{id}（分支 {branch}；目錄 {dir}）",
  modeUsage: "用法：/mode ask|semi|auto（ask 全問／semi 寫入才問／auto 全自動）",
  modeSwitched: "權限模式已切換為 {mode}",
  approvalPrompt: "允許 {detail}？ [y]這次 [a]本session同類都允許 [n]拒絕",
  worktreeUsage: "用法：/worktree list|new|diff <id>|merge <id>|prune <id>",
  worktreeLine: "  {id} · 檢查點 {n} · {dirty}",
  worktreeDirty: "有未存變更",
  worktreeClean: "乾淨",
  worktreeNone: "（尚無沙箱）",
  worktreePruned: "沙箱已拆除：{id}",
  worktreeMerged: "沙箱已 merge 回目前分支：{id}",
  worktreeMergeFail: "merge 失敗：{msg}",
  rollbackDone: "沙箱 {id} 已回滾 {n} 個檢查點",
  rollbackUsage: "用法：/rollback [N]（預設 1；作用於最新沙箱）",
  notGitRepo: "目前目錄不是 git 倉庫，沙箱功能需要 git",
  sandboxMissing: "找不到沙箱：{id}",
  mockCoderReply:
    "（mock 模式）收到：「{text}」\n這是模擬回覆——設定 NVIDIA_API_KEY 並以 npm start -- tui（不加 --mock）啟動，即為真 LLM 對話。",
  digestBoss: "老闆",
  taskDelivered: "✅ 雙門檻通過，任務交付。",
  taskCircuit: "⛔ 熔斷：轉人工裁決。",
  pipelineFail: "管道失敗：{msg}",
} as const;

export type MsgKey = keyof typeof ZH;

const EN: Record<MsgKey, string> = {
  banner: "Khuimeng report pipeline v{version} | mode: {mode} | topic: {topic}",
  modeMock: "mock (no API key)",
  modeReal: "real",
  delivered: "✅ Dual gate passed (viewer approve + tester pass). Task delivered.",
  circuit: "⛔ Circuit break: escalated to human.",
  runFail: "⛔ Run failed: {msg}",
  errPrefix: "Error: {msg}",
  needPath: "{flag} requires a directory path",
  needKeyword: "--match requires a keyword (task slug)",
  needFile: "{flag} requires a file path",
  needPositiveInt: "{flag} requires a positive integer, got: {value}",
  needSignature: "{flag} requires a signature",
  needLang: "--lang must be en or zh-TW",
  unknownFlag: "Unknown flag: {flag} (see --help)",
  taskFileReadFail: "Failed to read task file: {file}",
  taskFileEmpty: "Task file is empty: {file}",
  defaultTopic: "Will AI replace software engineers?",
  extraWatchArg: "Unexpected argument {arg} (watch takes exactly one role)",
  watchNoFlag: "watch does not support flag {flag}",
  watchRoleInvalid: "watch role must be coder|viewer|tester, got: {role}",
  notProvided: "(none)",
  watchStandby: "Standby — no new reports since launch",
  watchFilterSuffix: " (filter: {kw})",
  watchLastLabel: "Last",
  watchLastSuffix: " (pre-existing)",
  watchStatusTitle: "── Pipeline ",
  wFile: "File",
  wRound: "Round",
  wVerdict: "Verdict",
  wDeps: "Deps",
  watchFooter: " (refreshed {time}; Ctrl+C to quit)",
  chainRound: "round {n} · {verdict}",
  chainParseFail: "⚠ parse failed: {file}",
  unsupportedMode: "Unsupported pipeline.mode: {mode}",
  missingSeat: "seats.yaml is missing seat: {role}",
  needRegistry: "real mode requires a registry (or use mock: true)",
  fmNotObject: "frontmatter is not an object",
  roleInvalid: "invalid role: {role}",
  verdictDomain: "verdict \"{verdict}\" not in {role} domain [{domain}]",
  iterationInvalid: "iteration must be a positive integer, got: {value}",
  maxIterInvalid: "max_iterations must be a positive integer, got: {value}",
  keyArray: "{key} must be an array",
  fmInvalid: "frontmatter validation failed: {errors}",
  fmMissingFence: "report is missing the --- frontmatter fence",
  logStart: "▶ Pipeline start (mode={mode}, max_iterations={max}, mock={mock})",
  logStep: "  [{role} #{n}] verdict={verdict} → {action} ({file})",
  logCircuitBreak: "⛔ Circuit break: rejection limit reached ({max}). Escalate to human.",
  upstreamRejected:
    "(Previous round was rejected. Revise per Viewer/Tester feedback and resubmit, iteration={n})",
  roleFileInvalid:
    "Role check failed: {role} definition frontmatter must be role={role}, verdict=na",
  providerNoKey:
    "Provider {provider} has no API key (set the environment variable) or use --mock",
  providerNoKeyShort: "Provider {provider} has no API key or use --mock",
  reportInstruction:
    "Produce a Markdown report per your role definition. Output format (strict):\nLine 1 must be --- (nothing before it — no greeting, explanation, or code fence);\nthen YAML frontmatter with five fields: role: {role}, iteration: {iteration}, depends_on: [], target_files: [], verdict: <value>;\nthen a closing --- line, followed by the report body. verdict must be within your domain [{domain}].",
  roleMismatch: "report role={got} does not match expected {want}",
  iterMismatch: "report iteration={got} does not match expected {want}",
  replyHead: " (model reply head: {head})",
  seatNoSeats: "seats.yaml is missing the seats block: {path}",
  seatNoPipeline:
    "seats.yaml is missing the pipeline block (mode: report_chain + max_iterations): {path}",
  streamNoContent: "{name} stream ended with no content",
  streamThinkBurn:
    " (thinking consumed {chars} chars — likely exhausted max_tokens={max}; switch to a non-thinking model or raise the budget)",
  tuiNonTty:
    "Error: tui requires an interactive terminal (raw mode). Run it directly in a terminal, not piped/redirected.",
  tuiWelcomeMock: "Khuimeng TUI (mock mode) — type to chat with Coder; /help for commands.",
  tuiWelcome: "Khuimeng TUI — type to chat with Coder; /help for commands.",
  spinnerThinking: "{role} thinking…",
  statusHints: "↑↓ history · /help commands",
  lblYou: "You",
  lblSystem: "System",
  lblError: "Error",
  lblTask: "Pipeline",
  tuiHelp: [
    "Commands:",
    "  plain text          Chat with Coder (context preserved)",
    "  /ask <role> <text>   Address any role directly (group consult; shared transcript)",
    "  /viewer             Summon Viewer to review Coder's latest output",
    "  /tester             Summon Tester to accept the current output",
    '  /task "description" Run the full pipeline (dual gate + circuit breaker)',
    "  /model <role> <id>  Switch a seat's model (e.g. /model coder z-ai/glm-5.3-flash)",
    "  /seats              Show seat map",
    "  /reports            List recent reports",
    "  /provider <role> <p>  Hot-swap API provider (e.g. /provider coder openai)",
    "  /sessions           List saved sessions",
    "  /resume <name>      Resume a saved session",
    "  /rename <name>      Rename the current session",
    "  /clear              Clear conversation",
    "  /exit               Quit",
  ].join("\n"),
  seatUnavailable: "Seat {role}'s provider is unavailable (missing API key?) or use --mock",
  noChatYet: "Nothing to review yet — chat with Coder first, then summon {role}.",
  metaVerdict: "verdict: {verdict} · round {n} · saved {file}",
  reportFail: "{role} report failed: {msg}",
  coderFail: "Coder reply failed: {msg}",
  taskUsage: 'Usage: /task "task description"',
  taskStart: "▶ Full pipeline started: {task}",
  modelRoleInvalid: "Role must be coder|viewer|tester, e.g. /model coder z-ai/glm-5.3-flash",
  modelNeedId: "Model ID required, e.g. /model coder z-ai/glm-5.3-flash",
  modelSwitched: "{role} seat switched to {model} (this session only)",
  seatsTitle: "Seats:",
  reportsRecent: "Recent reports (top 10):",
  reportsNone: "(no reports yet)",
  cleared: "Conversation cleared.",
  unknownCmd: "Unknown command: {name} (/help for the list)",
  providerUsage:
    "Usage: /provider <role> <provider> [base_url]; providers: nvidia|openai|anthropic|google|deepseek",
  providerInvalid: "Provider must be nvidia|openai|anthropic|google|deepseek",
  providerSwitched:
    "{role} seat switched to provider {provider} (needs env var {env}; this session only)",
  sessionsTitle: "Saved sessions (top 10):",
  sessionsNone: "(no sessions yet)",
  sessionLine: "  {name} · {turns} turns · {time}",
  sessionNotFound: "Session \"{name}\" not found",
  sessionResumed: "Resumed session \"{name}\" ({n} turns)",
  sessionRenamed: "Session renamed to \"{name}\"",
  sessionNameInvalid: "Name must be 1-32 chars (letters incl. CJK, digits, hyphen)",
  sessionCurrent:
    "Current session: {name} (auto-saved; /rename to rename, /resume to switch)",
  askUsage: "Usage: /ask coder|viewer|tester <question> (plain text = ask Coder)",
  mockRoleReply:
    "(mock mode) {role} received: \"{text}\"\nSimulated reply — real {role} response in real mode.",
  toolSpec:
    "You can use file tools (inside the sandbox):\n" +
    "Write: a lone line \"<<<TOOL write_file path=<rel-path>\" then the full file content, ended by a lone \"TOOL>>>\" line.\n" +
    "Read: \"<<<TOOL read_file path=<rel-path>\" newline \"TOOL>>>\".\n" +
    "List: \"<<<TOOL list_files path=.\" newline \"TOOL>>>\".\n" +
    "Rules: paths are relative to the working dir; .env* and node_modules are forbidden; max 1MB per write. Tool results are fed back; when done, output the final report (line 1 must be ---, no more tool blocks).",
  sandboxCreated: "📁 Sandbox created: {id} (branch {branch}; dir {dir})",
  modeUsage: "Usage: /mode ask|semi|auto (ask = confirm all; semi = confirm writes; auto = all automatic)",
  modeSwitched: "Permission mode switched to {mode}",
  approvalPrompt: "Allow {detail}? [y]once [a]always this session [n]deny",
  worktreeUsage: "Usage: /worktree list|new|diff <id>|merge <id>|prune <id>",
  worktreeLine: "  {id} · checkpoints {n} · {dirty}",
  worktreeDirty: "dirty",
  worktreeClean: "clean",
  worktreeNone: "(no sandboxes)",
  worktreePruned: "Sandbox removed: {id}",
  worktreeMerged: "Sandbox merged into the current branch: {id}",
  worktreeMergeFail: "merge failed: {msg}",
  rollbackDone: "Sandbox {id} rolled back {n} checkpoint(s)",
  rollbackUsage: "Usage: /rollback [N] (default 1; applies to the newest sandbox)",
  notGitRepo: "Not a git repository — the sandbox requires git",
  sandboxMissing: "Sandbox not found: {id}",
  mockCoderReply:
    "(mock mode) Received: \"{text}\"\nThis is a simulated reply — set NVIDIA_API_KEY and run `npm start -- tui` (without --mock) for a real LLM chat.",
  digestBoss: "Boss",
  taskDelivered: "✅ Dual gate passed. Task delivered.",
  taskCircuit: "⛔ Circuit break: escalate to human.",
  pipelineFail: "Pipeline failed: {msg}",
};

const DICTS: Record<Lang, Record<MsgKey, string>> = {
  "zh-TW": ZH,
  en: EN,
};

/** 自 KHUIMENG_LANG / 系統 locale 偵測；無法判定時預設英文（開源預設） */
export function detectLang(): Lang {
  const explicit = (process.env.KHUIMENG_LANG ?? "").toLowerCase();
  if (explicit.startsWith("en")) return "en";
  if (explicit.startsWith("zh")) return "zh-TW";
  const locale = (
    process.env.LC_ALL ??
    process.env.LC_MESSAGES ??
    process.env.LANG ??
    ""
  ).toLowerCase();
  if (locale.startsWith("zh")) return "zh-TW";
  if (locale.startsWith("en")) return "en";
  return "en";
}

let current: Lang = detectLang();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
}

/** 取字串並做 {var} 插值 */
export function t(key: MsgKey, vars: Record<string, string | number> = {}): string {
  const template = DICTS[current][key];
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

/** 英文模式且存在 *.en.md 姊妹檔時改用之（角色檔雙語） */
export function resolveRoleFile(path: string): string {
  if (current === "en" && !path.endsWith(".en.md")) {
    const en = path.replace(/\.md$/, ".en.md");
    if (existsSync(en)) return en;
  }
  return path;
}

export function parseLang(value: string): Lang | null {
  const v = value.toLowerCase();
  if (v === "en" || v.startsWith("en")) return "en";
  if (v === "zh-tw" || v === "zh_tw" || v.startsWith("zh")) return "zh-TW";
  return null;
}
