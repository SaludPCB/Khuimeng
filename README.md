# Khuimeng

[中文說明](./README.zh-TW.md)

[![CI](https://github.com/SaludPCB/Khuimeng/actions/workflows/ci.yml/badge.svg)](https://github.com/SaludPCB/Khuimeng/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/khuimeng)](https://www.npmjs.com/package/khuimeng)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](./package.json)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/saludpcb)

> **Agents don't chat. They file reports.** One model writes the code, a *different* model reviews it, a third runs the tests — and nothing ships until both gates say yes.

![demo](./docs/demo.gif)

```bash
npx khuimeng --mock "write an add(a, b) function"   # full pipeline, no API key
```

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
# Install once, then just type `khuimeng`
npm install -g khuimeng
khuimeng --mock "your task"
khuimeng tui

# One-off, no clone (pipeline + TUI; for --sandbox, clone the repo)
npx khuimeng --mock "your task"
NVIDIA_API_KEY=nvapi-... npx khuimeng "your task"

# From source
npm install

# Try it: mock mode, no API key needed
npm start -- --mock "your task"

# Real mode: one NVIDIA key drives all three seats
export NVIDIA_API_KEY=nvapi-...
npm start -- "your task"

# Or: cp .env.example .env, put keys in .env (auto-loaded, gitignored)

npm test
```

## Skills

Drop `skills/<name>/SKILL.md` to teach the team new tricks (Markdown + frontmatter, same as role files): `description` explains the skill, `roles: [tester]` restricts it (omit = all roles). Loaded skills are injected into matching roles' system prompts — `/skills` lists them. Two examples ship: `testing-discipline` (tester focus) and `repo-conventions` (all roles).

## Sandbox & file tools (P2)

`--sandbox` enables a git worktree playground: Coder writes real files (inside the sandbox only), Viewer/Tester get read-only tools — your main working tree stays untouched.

```bash
npm start -- --mock --sandbox "task"          # pipeline mode (batch, auto)
npm start -- tui → /mode ask|semi|auto       # three permission tiers in TUI (y/a/n before writes)
npm start -- sandbox list|new|diff|merge|prune|rollback   # sandbox management
```

The tool protocol is plain text (no function-calling dependency — works with any model); a checkpoint is created after each coder round, and `rollback` restores them.

**P2-2 shell tools**: `<<<TOOL run cmd=npm test … TOOL>>>` whitelisted execution (npm test / npm run / npx vitest / node / tsc / read-only git), dangerous patterns (`rm -rf`, `sudo`, pipe-downloads…) auto-denied without asking; 60s timeout + output truncation. Permission matrix: Coder writes & runs, **Tester cannot write but can run tests (verdicts from real logs)**, Viewer neither.

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
| `/undo [N]` `/retry` | Rewind N question rounds / resend the last question |
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
