# Khuimeng

通用多角色 AI 辯論與共識生成框架 — Multi-Agent Debate Framework with true multi-LLM support.

讓多個不同角色（各搭配不同 LLM 供應商）就一個議題互相辯論，產生比單一模型更嚴謹、更多視角的結論。

## 特色

- **多角色辯論**：主持人、領域專家、質疑者、總結者分工互動
- **真實多 LLM**：每個角色可路由到不同供應商（OpenAI / Anthropic / Google / DeepSeek）
- **座席映射**：透過 `configs/seats.yaml` 靈活指派角色到模型
- **共識防同質化**：強制異議機制，避免集體趨同
- **Markdown 角色檔**：社群可輕鬆透過 PR 貢獻新角色

## 架構

```
┌──────────────────────────────┐
│ UI / CLI（打字機輸出）         │
├──────────────────────────────┤
│ DebateEngine（辯論與共識引擎）  │
├──────────────────────────────┤
│ Agents + Seats（角色與座席）   │
├──────────────────────────────┤
│ Multi-LLM Provider（多模型）  │
└──────────────────────────────┘
```

## 快速開始

```bash
npm install
# 至少設定兩個供應商的 API key
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...
export DEEPSEEK_API_KEY=...

# 執行 MVP（雙 Agent 雙模型辯論）
npm run mvp -- "你想要討論的議題"

# 或完整 CLI
npm start -- "議題"
```

## 目錄結構

```
Khuimeng/
├── bin/cli.ts            # npx 執行入口
├── configs/seats.yaml    # 座席映射與辯論規則
├── agents/*.md           # 角色定義（Markdown）
├── src/
│   ├── llm/              # 多模型 Provider 層
│   ├── agent/            # Agent 封裝與角色載入
│   ├── debate/           # 辯論引擎、記憶、共識判定
│   ├── ui/               # 終端機介面
│   └── index.ts          # 套件入口
└── examples/             # MVP 範例
```

## License

MIT