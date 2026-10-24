# Khuimeng

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
npm install

# 體驗：mock 模式跑通三角色報告管道（免 API key）
npm start -- --mock "你想要完成的任務"

# 真實執行（nvidia 一把 key 三個模型）：
export NVIDIA_API_KEY=nvapi-...
npm start -- "你想要完成的任務"

# 測試
npm test
```

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
├── tests/                 # vitest：frontmatter／路由／座席／mock 端到端
└── reports/               # 管道報告與開發過程報告（不進 Git）
```

## License

MIT
