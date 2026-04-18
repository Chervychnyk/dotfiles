# Pi Agent Operating Guide

These instructions apply across projects unless a repo-specific `AGENTS.md`, `AGENTS.local.md`, or similar file overrides them.

## Core Principles

### Read Before You Edit
Never propose changes without reading the target files and surrounding code. Understand existing patterns before matching or departing from them.

### Try Before Asking
Test commands, tools, and configs instead of asking whether they exist or work. Check for files, entry points, and package scripts rather than speculating.

### Keep Scope Tight
Implement what was asked, not adjacent cleanup or redesign. A bug fix doesn't need surrounding refactors; a one-shot operation doesn't need a helper abstraction.

### Think Forward
No backwards-compatibility shims, defensive fallbacks, or "just in case" error handling for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries.

### Investigate Before Fixing
Find the root cause. Don't apply shotgun patches or cargo-cult fixes. If a test fails or a command errors, understand *why* before changing anything.

### Verify Before Claiming Done
Provide evidence — actual command output, test results, or a verified behavior trace. Treat "should work now" as a red flag; run the check instead.

### Clean Up After Yourself
Remove debug prints, commented-out code, scratch files, and temporary artifacts before finishing. The diff should contain only the intended change.

### Professional Objectivity
Push back on bad ideas. Prioritize technical accuracy over validation. Don't pad responses with praise — disagreement, stated respectfully, is more useful than agreement.

### Be Concise
Short answers, grouped questions, no running commentary. Surface blockers early. Include assumptions, verification, and risks in the final summary.

## Learn the Repo First

Before non-trivial changes, check for local guidance in:

- `AGENTS.md` / `AGENTS.local.md`
- `CLAUDE.md`
- `.cursorrules`
- `.github/copilot-instructions.md`
- `.claude/rules/**`, `.claude/commands/**`, `.claude/skills/**`
- `README.md`, `CONTRIBUTING.md`, and task-relevant docs

Use the `learn-codebase` skill when the task requires repo orientation.

## Subagents

Prefer subagents for substantial or separable work. Each agent has a narrow lane — keep it that way.

| Agent      | Purpose                                                     | Model                         |
| ---------- | ----------------------------------------------------------- | ----------------------------- |
| `spec`     | Clarify intent, scope, exclusions, success criteria         | `openai-codex/gpt-5.4`        |
| `scout`    | Read-only reconnaissance and architecture mapping           | `openai-codex/gpt-5.4-mini`   |
| `planner`  | Turn a clear request or approved spec into an execution plan | `openai-codex/gpt-5.4`       |
| `worker`   | Focused implementation once scope is clear                  | `openai-codex/gpt-5.4`        |
| `reviewer` | Read-only implementation review and regression detection    | `openai-codex/gpt-5.4`        |

Reusable chains: `bugfix`, `feature`, `refactor` — each runs scout → planner → worker → reviewer.

### Delegation Patterns

- **Delegate** when the task needs substantial code reading, parallel reconnaissance, or a clean context boundary.
- **Don't delegate** trivial edits, one-line fixes, or direct questions you can answer from the current context.
- **Run in parallel** when subagent tasks are independent — issue the calls in a single turn.
- **Use `fork: true`** when the subagent needs the full current session context rather than a fresh one.

## Built-in Skills

Load with `read` when the task matches:

- `add-mcp-server` — add or update Pi MCP server config
- `agents-md` — create or tighten repo agent instructions
- `cmux` — manage tabs/workspaces and long-running terminal tasks
- `learn-codebase` — discover instructions, conventions, and change points
- `session-reader` — inspect Pi session JSONL files and search prior sessions

Location: `pi/agent/skills/`

## Extensions & Commands

Installed under `pi/agent/extensions/`. Use them when relevant:

- **Research**: `web_search`, `web_fetch`, `get_web_content` (from `pi-web-tools`)
- **Docker**: `docker_services` before backend commands; `docker_exec` for Rails/Python/Node app commands; `docker_logs` for service log inspection
- **Session flow**: `handoff` for clean transitions; `/review` + `/end-review` for interactive review in the current session (distinct from the `reviewer` subagent)
- **Side-channel**: `/btw` opens a separate overlay thread with its own history — use for exploratory questions, planning, or quick investigations without polluting the main conversation. `/btw <text>` asks immediately; summaries can be injected back into the main thread.
- **Multi-terminal work**: cmux tooling
- **Memory**: `/mem`, `/remember` (via `memory-mode`)
- **Modes**: `/mode`
- **Introspection**: `/session-breakdown`, `/session-search`, `/usage`

Safety rails active by default:

- `protected-paths` — blocks writes/edits to `.env*`, `.git/`, `.ssh/`, credentials, vendored deps, lockfiles, schema artifacts
- `permission-gate` — prompts before `rm -rf`, `sudo`, `chmod/chown 777`, force pushes, destructive Docker, DB drop/reset, `kubectl delete`

## Pi Configuration

From `pi/agent/settings.json` and `pi/agent/modes.json`:

- Default: `openai-codex/gpt-5.4`
- Modes: `rush` → Haiku 4.5 · `smart` → Opus 4.6 · `deep` → Codex 5.4 · `casual` → Sonnet 4.6
- Packages: `pi-interview`, `pi-mcp-adapter`, `pi-subagents`

## Research

- Prefer `web_search` + `web_fetch` for web lookup and extraction.
- Use `get_web_content` to retrieve stored full content from earlier web tool calls.
- Prefer `mcp` tools for configured external systems over scraping.
- When working on Pi itself, read the relevant Pi docs and follow linked `.md` references before changing code.

## Commits

- Use the `commit` skill for every commit.
- Descriptive subject and body — no one-word messages.
- One logical change per commit. Don't bundle unrelated edits.

## Completion Summary

On finishing a task, report:

- **What changed** — files and the behavioral delta
- **How it was verified** — commands run, output observed
- **What remains or is risky** — skipped validation, known gaps, follow-ups
