# Khuimeng

[English](./README.md)

[![CI](https://github.com/SaludPCB/Khuimeng/actions/workflows/ci.yml/badge.svg)](https://github.com/SaludPCB/Khuimeng/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/khuimeng)](https://www.npmjs.com/package/khuimeng)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/saludpcb)

> **代理不聊天，只交報告。** 一個模型寫程式、*另一家*模型審查、第三個跑測試——兩道關卡都放行才交付。

```bash
npx khuimeng --mock "寫一個 add(a, b) 函式"   # 免 API key 跑完整條管道
```

報告驅動的三角色 AI 工程管道 — Report-driven multi-agent pipeline with true multi-LLM support.

三個不同 LLM 供應商驅動的角色（Coder → Viewer → Tester）以 **Markdown 報告為唯一溝通媒介** 協作完成軟體任務：跨模型異質性作為品質防線，雙門檻判定（Viewer approve ＋ Tester pass）才放行交付。

## 特色

- **報告即介面**：代理之間不對話、不共享記憶，只交結構化 Markdown 報告（YAML frontmatter 五欄通訊協定）
- **真實多 LLM**：每個角色可路由到不同供應商（OpenAI / Anthropic / Google / DeepSeek）
- **判定值域鎖死**：Coder `na`／Viewer `approve`、`request_changes`／Tester `pass`、`blocked`，跨值域即違約
- **雙門檻＋熔斷**：Viewer 與 Tester 同時放行才交付；退回達 `max_iterations: 3` 自動熔斷轉人工
- **mock 模式**：免 API key 跑通全鏈，方便體驗與測試
- **Markdown 角色檔**：社群可輕鬆透過 PR 貢獻／調整角色

## 架構

```
任務輸入 ──▶ Coder AI ──[實作報告]──▶ Viewer AI ──[審查報告]──▶ Tester AI ──[測試報告]
                ▲                        │ approve                        │ pass
                └────── request_changes / blocked（退回，iteration＋1，上限 3 輪熔斷）──┘
```

```
┌────────────────────────────────────┐
│ CLI（npm start，--mock 模擬模式）    │
├────────────────────────────────────┤
│ ReportPipeline（校驗·路由·雙門檻·熔斷）│
├────────────────────────────────────┤
│ Agents + Seats（agents/*.md + seats.yaml）│
├────────────────────────────────────┤
│ Multi-LLM Provider（多模型）         │
└────────────────────────────────────┘
```

## 快速開始

```bash
# 全域安裝，之後直接打 `khuimeng`
npm install -g khuimeng
khuimeng --mock "你的任務"
khuimeng tui

# 免 clone 直接試（管道＋TUI；要用 --sandbox 請 clone 原始碼）
npx khuimeng --mock "你的任務"
NVIDIA_API_KEY=nvapi-... npx khuimeng "你的任務"

# 從原始碼
npm install

# 體驗：mock 模式跑通三角色報告管道（免 API key）
npm start -- --mock "你想要完成的任務"

# 真實執行（nvidia 一把 key 三個模型）：
export NVIDIA_API_KEY=nvapi-...
npm start -- "你想要完成的任務"

# 或:cp .env.example .env,把 key 填進 .env(自動載入,已 gitignore)

# 測試
npm test
```

## Skills（技能說明書）

放 `skills/<名稱>/SKILL.md` 即自動生效（Markdown + frontmatter，與角色檔同構）：`description` 說明用途，`roles: [tester]` 限定角色（省略＝全部）。載入後注入對應角色的 system prompt——`/skills` 查看已載入。隨附兩個範例：`testing-discipline`（tester 驗收紀律）、`repo-conventions`（全角色倉庫慣例）。

## 沙箱與檔案手（P2）

`--sandbox` 開啟 git worktree 練習房：Coder 真的寫檔（僅限沙箱內）、Viewer/Tester 唯讀檢查，主工作樹零風險。

```bash
npm start -- --mock --sandbox "任務"          # 管道模式（批次全自動）
npm start -- tui → /mode ask|semi|auto       # TUI 內三段權限（寫入前 y/a/n 確認）
npm start -- sandbox list|new|diff|merge|prune|rollback   # 沙箱管理
```

工具協定為純文字（不依賴 function-calling，任何模型可用）；每次 Coder 交棒自動建立檢查點，`rollback` 可回退。

**P2-2 shell 手**：`<<<TOOL run cmd=npm test … TOOL>>>` 白名單指令執行（npm test／npm run／npx vitest／node／tsc／git 唯讀查詢），危險樣式（`rm -rf`、`sudo`、管線下載…）連問都不問直接拒；逾時 60 秒＋輸出截斷。權限矩陣：Coder 可寫可跑、**Tester 禁寫可跑測試（用真 log 判定）**、Viewer 禁寫禁跑。

## 互動式 TUI

像 opencode／Claude Code 的互動介面，核心是三角色治理——跟 Coder 對話，用指令召喚審查與驗收：

```bash
npm start -- tui --mock    # mock 模式（免 key 體驗介面）
npm start -- tui           # real 模式（設 NVIDIA_API_KEY）
```

| 輸入 | 作用 |
|---|---|
| 直接打字 | 與 Coder 多輪對話（保留上下文，↑↓ 召回歷史） |
| `/viewer` | 召喚 Viewer 審查當前產出（報告落盤 reports/pipeline） |
| `/tester` | 召喚 Tester 驗收當前產出 |
| `/task "任務"` | 跑全自動管道（雙門檻＋熔斷） |
| `/model coder 模型ID` | 熱切換席位模型 |
| `/ask viewer coder 分析得正確嗎` | 指名問任一角色（三方會診，全員共用對話紀錄） |
| `/undo [N]` `/retry` | 倒退 N 輪提問收回重打／重送最後一句 |
| `/provider coder openai [base_url]` | 熱切換席位 API 供應商 |
| `/sessions` `/resume <名>` `/rename <名>` | session 存續（自動存檔、續跑、改名） |
| `/seats` `/reports` `/clear` `/help` `/exit` | 座位表／報告清單／清空／說明／離開 |

## 三視窗觀測（watch）

開三個終端機視窗各盯一個大腦，第四個視窗跑任務——三個工位依序開工的畫面：

```bash
npm start -- watch coder    # 視窗 1：Coder 席（啟動即待命）
npm start -- watch viewer   # 視窗 2：Viewer 席
npm start -- watch tester   # 視窗 3：Tester 席
npm start -- --mock "任務"  # 視窗 4：跑任務（或 real 模式）
```

**待命語義**：watcher 啟動時進入待命（目錄裡的舊報告只在「上次」一行帶過，不全文上屏）；**啟動之後**新落盤的報告才會上屏，按落盤時間排序。多任務並行時用 `--match <任務slug>` 只盯特定任務：

```bash
npm start -- watch coder --match 我的任務
```

`--once` 渲染一次即退出（快速查看目前最新面板）。

## 換廠商（插座式座位表）

席位即插座：改 `configs/seats.yaml` 即換廠商，代碼零改動。任何 OpenAI 相容端點（Groq／Together／OpenRouter／Ollama／vLLM…）加 `base_url` 即接：

```yaml
seats:
  coder:
    provider: nvidia            # 或 openai
    model: llama-3.3-70b-instruct
    base_url: https://api.groq.com/openai/v1
```

內建供應商：`nvidia`（NIM）、`openai`、`anthropic`、`google`、`deepseek`，環境變數各為 `NVIDIA_API_KEY`／`OPENAI_API_KEY`／`ANTHROPIC_API_KEY`／`GOOGLE_API_KEY`／`DEEPSEEK_API_KEY`。

## CLI 旗標

```bash
npm start -- --lang en "任務"        # 英文介面＋英文角色檔（多語系）
npm start -- --mock --json "任務"        # 機器可讀 JSON 輸出
npm start -- -f 任務書.md                # 任務書從檔案讀入
npm start -- --max-iterations 5 "任務"   # 覆寫熔斷上限
npm start -- --reports-dir /tmp/r "任務" # 自訂報告輸出目錄
```

Exit codes：`0` delivered（雙門檻通過）｜`1` circuit_break（熔斷轉人工）｜`2` 使用錯誤或校驗失敗。

報告產出至 `reports/pipeline/`，檔名即信封：`{角色}_{輪次}_{任務}_{署名}.md`。

## 目錄結構

```
Khuimeng/
├── bin/cli.ts             # CLI 入口（--mock / real）
├── configs/seats.yaml     # 座席映射與管道設定（mode / max_iterations）
├── agents/*.md            # 角色定義（YAML frontmatter 五欄＋職責＋紅線）
├── src/
│   ├── llm/               # 多模型 Provider 層
│   ├── agent/             # Agent 封裝、角色檔與座席載入
│   ├── pipeline/          # 報告調度引擎（校驗、路由、雙門檻、熔斷、mock）
│   ├── debate/            # （封存）舊辯論引擎
│   └── index.ts           # 套件入口
├── legacy/                # （封存）舊辯論引擎
├── tests/                 # vitest：frontmatter／路由／座席／mock 端到端／TUI
└── reports/               # 管道報告與開發過程報告（不進 Git）
```

## License

MIT
