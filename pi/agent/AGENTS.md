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
- `ralph-wiggum` — guidance for long-running iterative loops via the local Ralph extension

Skill location: `pi/agent/skills/`

## Current Subagents

Prefer subagents for substantial work:

- `scout` — read-only reconnaissance and architecture mapping
- `planner` — phased plans, ambiguity reduction, grouped questions
- `worker` — focused implementation once scope is clear
- `reviewer` — read-only implementation review and regression detection

Reusable global chains:

- `bugfix` — scout → planner → worker → reviewer
- `feature` — scout → planner → worker → reviewer
- `refactor` — scout → planner → worker → reviewer

If tasks are independent, delegate in parallel.

## Current Extensions / Commands

Installed local extensions live in `pi/agent/extensions/`:

- `auto-session-name.ts`
- `clipboard.ts` — clipboard helper tool
- `cmux.ts`
- `custom-footer.ts`
- `docker-context.ts` — Docker Compose discovery plus `docker_services`, `docker_exec`, `docker_logs`
- `go-to-bed.ts`
- `handoff.ts` — `/handoff` command and `handoff` tool
- `memory-mode.ts` — `/mem`, `/remember`
- `modes.ts` — `/mode`
- `ralph-wiggum.ts` — `/ralph`, `/ralph-stop`, `ralph_start`, `ralph_done`
- `review.ts` — `/review`, `/end-review`
- `sandbox/`
- `session-breakdown.ts` — `/session-breakdown`
- `usage-bar.ts` — `/usage`
- `guardrails.json`

Use extension-backed workflows when relevant:

- `web_search` for web search
- `fetch_content` / `get_search_content` for content extraction, GitHub URL fetching, PDFs, and richer web access via `pi-web-access`
- `code_search` for code and repository discovery on the web
- `docker_services` before backend commands when Docker Compose may be involved
- `docker_exec` for Rails, Python, Node, and other app commands that should run in containers
- `docker_logs` for targeted service log inspection
- `handoff` for clean session transitions
- `review` / `end-review` for review-focused iteration
- `ralph_start` / `ralph_done` or `/ralph` for long-running iterative loops
- cmux tooling when work benefits from multiple managed terminals

## Current Pi Configuration

From `pi/agent/settings.json` and `pi/agent/modes.json`:

- Default provider/model: `openai-codex` / `gpt-5.4`
- Default thinking level: `high`
- Modes:
  - `rush` → `anthropic / claude-haiku-4-5`
  - `smart` → `anthropic / claude-opus-4-6`
  - `deep` → `openai-codex / gpt-5.4`
  - `casual` → `anthropic / claude-sonnet-4-6`
- Installed packages:
  - `npm:pi-interview`
  - `npm:pi-mcp-adapter`
  - `npm:@aliou/pi-guardrails`
  - `npm:pi-subagents`
  - `npm:pi-web-access`

## Research Guidance

- Prefer `web_search` for web lookup, then `fetch_content` or `get_search_content` for page, repository, and content extraction.
- Use `code_search` when you need web-scale code or repository discovery from the installed `pi-web-access` package.
- For GitHub research, prefer `fetch_content` on GitHub URLs and `code_search` when broad repository/code discovery is needed.
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
