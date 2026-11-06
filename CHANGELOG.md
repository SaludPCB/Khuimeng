# Changelog

## v0.1.0 — first public release

- Report-driven pipeline: Coder → Viewer → Tester exchanging Markdown reports (five-field YAML frontmatter), fail-closed verdict domains
- Dual gate (Viewer `approve` + Tester `pass`) and circuit breaker (`max_iterations: 3`, then escalate to a human)
- True multi-LLM seats via `configs/seats.yaml` (NVIDIA NIM, OpenAI, Anthropic, Google, DeepSeek, any OpenAI-compatible `base_url`)
- Git-worktree sandbox with checkpoints/rollback; plain-text tool protocol with a command whitelist and permission matrix
- Interactive Ink TUI (`/viewer`, `/tester`, `/task`, `/ask`, `/model`, `/provider`, sessions, undo/retry)
- Skills system (`skills/<name>/SKILL.md`, per-role injection)
- Mock mode (no API key), bilingual UI (`--lang en | zh-TW`)
- `npx khuimeng` entry (runs TypeScript via tsx, no build step); role files now resolve relative to the install root instead of cwd
