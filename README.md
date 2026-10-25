# Khuimeng

[中文說明](./README.zh-TW.md)

Report-driven three-role AI engineering pipeline — multi-agent governance with true multi-LLM support.

Three roles powered by different LLM providers (**Coder → Viewer → Tester**) collaborate on software tasks with **Markdown reports as their only communication medium**: cross-model heterogeneity as a quality defense line, and a dual-gate verdict (Viewer `approve` + Tester `pass`) required before anything is delivered.

## Features

- **Reports as the interface**: agents never talk to each other directly — they exchange structured Markdown reports (a five-field YAML frontmatter protocol)
- **True multi-LLM**: every seat can be routed to a different provider (NVIDIA NIM, OpenAI, Anthropic, Google, DeepSeek, or any OpenAI-compatible endpoint via `base_url`)
- **Locked verdict domains**: Coder `na` / Viewer `approve`·`request_changes` / Tester `pass`·`blocked` — out-of-domain verdicts are rejected at parse time (fail-closed)
- **Dual gate + circuit breaker**: delivery requires both Viewer and Tester to pass; after `max_iterations: 3` rejections the pipeline escalates to a human
- **Interactive TUI**: chat with Coder, summon `/viewer` and `/tester` reviews on demand (Ink + React)
- **Mock mode**: run the entire chain with no API key
- **Bilingual UI**: `--lang en | zh-TW` (English role files included)
- **Markdown role files**: customize or contribute roles via PR

## Architecture

```
task ──▶ Coder ──[report]──▶ Viewer ──[review]──▶ Tester ──[acceptance]
           ▲                   │ approve                  │ pass
           └─── request_changes / blocked (retry, max 3, then circuit-break to human)
```

## Quick start

```bash
npm install

# Try it: mock mode, no API key needed
npm start -- --mock "your task"

# Real mode: one NVIDIA key drives all three seats
export NVIDIA_API_KEY=nvapi-...
npm start -- "your task"

npm test
```

## Sandbox & file tools (P2)

`--sandbox` enables a git worktree playground: Coder writes real files (inside the sandbox only), Viewer/Tester get read-only tools — your main working tree stays untouched.

```bash
npm start -- --mock --sandbox "task"          # pipeline mode (batch, auto)
npm start -- tui → /mode ask|semi|auto       # three permission tiers in TUI (y/a/n before writes)
npm start -- sandbox list|new|diff|merge|prune|rollback   # sandbox management
```

The tool protocol is plain text (no function-calling dependency — works with any model); a checkpoint is created after each coder round, and `rollback` restores them.

## Interactive TUI

```bash
npm start -- tui --mock    # mock mode
npm start -- tui           # real mode
```

| Input | Effect |
|---|---|
| plain text | Chat with Coder (context preserved, ↑↓ history) |
| `/viewer` | Summon Viewer to review the current output (report persisted) |
| `/tester` | Summon Tester to accept the current output |
| `/task "..."` | Run the full automated pipeline (dual gate + circuit breaker) |
| `/model coder <model-id>` | Hot-swap a seat's model |
| `/ask viewer is coder right?` | Address any role directly (group consult, shared transcript) |
| `/provider coder openai [base_url]` | Hot-swap a seat's API provider |
| `/sessions` `/resume <name>` `/rename <name>` | Sessions (auto-saved, resume, rename) |
| `/seats` `/reports` `/clear` `/help` `/exit` | seat map / report list / clear / help / quit |

## Three-window observation

```bash
npm start -- watch coder    # terminal 1 (standby until a task fires)
npm start -- watch viewer   # terminal 2
npm start -- watch tester   # terminal 3
npm start -- --mock "task"  # terminal 4: run the task
```

Panels refresh by file mtime; `--match <slug>` tracks one task; `--once` renders once.

## Swapping providers

Seats are sockets — edit `configs/seats.yaml`, zero code changes:

```yaml
seats:
  coder:
    provider: nvidia            # or openai
    model: meta/llama-3.3-70b-instruct
    base_url: https://api.groq.com/openai/v1   # any OpenAI-compatible endpoint
```

## CLI flags

```bash
npm start -- --lang en "task"          # English UI + English role files
npm start -- --mock --json "task"      # machine-readable JSON
npm start -- -f task.md                # task from a file
npm start -- --max-iterations 5 "..."  # override the breaker limit
```

Exit codes: `0` delivered | `1` circuit_break | `2` usage/validation error.

## Project layout

```
Khuimeng/
├── bin/cli.ts             # CLI entry (tui / watch / pipeline)
├── configs/seats.yaml     # seat map + pipeline settings
├── agents/*.md            # role definitions (zh-TW + .en.md)
├── src/
│   ├── i18n.ts            # bilingual UI strings
│   ├── llm/               # providers (generic OpenAI-compatible, streaming)
│   ├── agent/             # role & seat loading, BaseAgent
│   ├── pipeline/          # report engine + watcher (validate · route · gates · breaker)
│   └── tui/               # Ink TUI (chat + slash commands)
├── legacy/                # sealed old debate engine (kept for reference)
├── tests/                 # vitest: protocol · routing · seats · mock e2e · TUI
└── reports/               # pipeline reports (not tracked in git)
```

## License

MIT
