# Pi Agent Operating Guide

These instructions apply across projects unless a repo-specific `AGENTS.md`, `AGENTS.local.md`, or similar file overrides them.

## Core Rules

1. Understand the target code before editing it.
2. Prefer small, explicit changes over broad refactors.
3. Use tools to verify facts instead of guessing.
4. Delegate substantial or separable work to subagents.
5. Be concise, but always include assumptions, verification, and risks.

## Learn the Repo First

Before non-trivial changes, check for local guidance in:

- `AGENTS.md` / `AGENTS.local.md`
- `CLAUDE.md`
- `.cursorrules`
- `.github/copilot-instructions.md`
- `.claude/rules/**`, `.claude/commands/**`, `.claude/skills/**`
- `README.md`, `CONTRIBUTING.md`, and task-relevant docs

Use the `learn-codebase` skill when the task requires repo orientation.

## Available Built-in Skills

Load these with `read` when the task matches:

- `add-mcp-server` — add or update Pi MCP server config
- `agents-md` — create or tighten repo agent instructions
- `cmux` — manage tabs/workspaces and long-running terminal tasks in cmux
- `learn-codebase` — discover instructions, conventions, and change points
- `web-search` — thin wrapper that points the model to the `web_search` extension tool
- `web-fetch` — thin wrapper that points the model to the `web_fetch` extension tool

Skill location: `pi/agent/skills/`

## Current Subagents

Prefer subagents for substantial work:

- `scout` — read-only reconnaissance and architecture mapping
- `planner` — phased plans, ambiguity reduction, grouped questions
- `worker` — focused implementation once scope is clear

If tasks are independent, delegate in parallel.

## Current Extensions / Commands

Installed local extensions live in `pi/agent/extensions/`:

- `auto-session-name.ts`
- `clipboard.ts`
- `cmux.ts`
- `custom-footer.ts`
- `go-to-bed.ts`
- `handoff.ts`
- `memory-mode.ts`
- `modes.ts`
- `ralph-wiggum.ts`
- `review.ts`
- `session-breakdown.ts`
- `usage-bar.ts`
- `web-tools/` — custom tools: `web_search`, `web_fetch`
- `guardrails.json`

Use extension-backed workflows when relevant:

- `web_search` for current web search results
- `web_fetch` for fetching and extracting URL content
- `handoff` for clean session transitions
- `review` for review-focused iteration
- `ralph_start` / `ralph_done` for long-running iterative loops
- cmux tooling when work benefits from multiple managed terminals

## Current Pi Configuration

From `pi/agent/settings.json` and `pi/agent/modes.json`:

- Default provider/model: `openai-codex` / `gpt-5.4`
- Modes:
  - `rush` → `anthropic / claude-haiku-4-5`
  - `smart` → `anthropic / claude-opus-4-6`
  - `deep` → `openai-codex / gpt-5.4`
  - `casual` → `anthropic / claude-sonnet-4-6`
- Installed packages:
  - `npm:pi-interview`
  - `npm:pi-mcp-adapter`
  - `npm:@aliou/pi-guardrails`
  - `git:github.com/HazAT/pi-interactive-subagents`

## Research Guidance

- Prefer `web_search` + `web_fetch` extension tools for web lookup and content extraction.
- Wrapper skills `web-search` and `web-fetch` remain available for discoverability and `/skill:` usage.
- Prefer `mcp` tools for configured external systems when they provide direct access.
- When working on Pi itself, read the relevant Pi docs and follow linked `.md` references before changing code.

## Implementation Guidance

- Match existing project patterns and naming.
- Preserve behavior unless the task explicitly asks for behavioral change.
- Verify with the most relevant checks available.
- Call out skipped validation, blockers, or follow-up work.

## Communication

- Group questions so the user can answer efficiently.
- Surface blockers early.
- On completion, summarize:
  - what changed
  - how it was verified
  - what remains or may be risky
