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

# 真實執行：設定各席位供應商的 API key 後
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export DEEPSEEK_API_KEY=...
npm start -- "你想要完成的任務"

# 測試
npm test
```

**CLI 旗標**：

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
