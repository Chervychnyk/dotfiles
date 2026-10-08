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

### Stop on Permission Errors
Permission failures are scoped to the agent and operation that receives them. If your own command or tool call is denied because of permissions, approval, sandboxing, or an operation-not-permitted error, stop that operation immediately, report the blocker, and wait for the user. Do not retry, bypass, or work around your own denial unless the user explicitly asks.

A denial received by a subagent is not inherited by its parent. The subagent must stop and report the denied operation, but the parent may continue independent work and may perform the operation through its own normal tool path. The parent must stop only if its own operation is denied. Never direct a denied subagent to circumvent its denial.

### Clean Up After Yourself
Remove debug prints, commented-out code, scratch files, and temporary artifacts before finishing. The diff should contain only the intended change.

### Professional Objectivity
Push back on bad ideas. Prioritize technical accuracy over validation. Don't pad responses with praise — disagreement, stated respectfully, is more useful than agreement.

### Be Concise
Short answers, grouped questions, no running commentary. Surface blockers early. Include assumptions, verification, and risks in the final summary.

## Engineering Loop

For non-trivial work, use focused steps rather than one large implementation pass. Keep the work in the main agent unless a subagent removes a specific uncertainty or isolates genuinely independent work:

1. Inspect the existing design and affected files.
2. Identify weak cohesion, unclear boundaries, and risky dependencies.
3. Sketch the preferred shape before coding:
   - public API or user-facing contract
   - call graph
   - data model or interfaces
   - seams, injected dependencies, adapters, and test doubles
   - production vs test behavior
   - domain vocabulary from `CONTEXT.md` and relevant ADR constraints, if present
4. Confirm scope when product behavior or architecture materially changes.
5. Implement in vertical slices:
   - one targeted failing or missing check
   - one minimal implementation
   - one passing verification
6. Review using focused annotations or checklist items.
7. Codify repeated mistakes into AGENTS.md, skills, or agent definitions.
8. End with a completion summary: files changed, behavior changed, checks run, risks, and next todos if useful.

### Reference Repos and Examples

For framework-specific or unfamiliar patterns, prefer reading local reference repos, examples, official docs, or existing in-repo implementations before relying on model memory. Keep the reference scope tight and cite which pattern was followed.

## Learn the Repo First

Before non-trivial changes, check for local guidance in:

- `AGENTS.md` / `AGENTS.local.md`
- `CLAUDE.md`
- `.cursorrules`
- `.github/copilot-instructions.md`
- `.claude/rules/**`, `.claude/commands/**`, `.claude/skills/**`
- `README.md`, `CONTRIBUTING.md`, and task-relevant docs

Use the `learn-codebase` skill only when the repository or affected code path is unfamiliar and the task depends on undiscovered conventions, entry points, or validation commands. Skip it for targeted edits, direct lookups, documentation-only work, and familiar code paths. For build/run/security-sensitive changes, load it only when those facts are not already known.

## Todos

Use the `todo` tool to track a non-trivial task within the current conversation.

- Available actions are `create`, `update`, `list`, `get`, `delete`, and `clear`.
- Item statuses are `pending`, `in_progress`, `completed`, and `deleted`.
- Create plan items before implementation, update their status as work proceeds, and keep verification results in the relevant item.
- Treat the plan as session-local. It is not a cross-session backlog and has no ownership or claim workflow.

## Subagents

Use a subagent only when it removes a named uncertainty, isolates independent work, or supplies an independent high-risk review. The main agent remains the default implementer and decision-maker.

Routing:

- Known files, concrete findings, or an existing implementation plan → handle directly.
- Unclear product intent → use `spec`.
- Unfamiliar architecture or entry points → use one read-only `scout`.
- A fix remains non-obvious after inspection → use `planner`; otherwise plan directly.
- Large, well-bounded implementation that benefits from context isolation → use one `worker`.
- Security, data integrity, concurrency, auth, payments, migrations, or public APIs → use one fresh-context `reviewer` after implementation.
- Independent research and local reconnaissance may run in parallel when their ownership does not overlap.

A completed review with file-level findings counts as reconnaissance and planning. Implement those findings directly unless one is technically ambiguous. Do not chain `scout → planner → worker → reviewer` by default.

Budget: default to at most one implementation-side subagent and one review subagent per task. Exceed this only for explicitly independent parallel work or when the user requests deeper delegation. When uncertain, continue in the main agent.

Operational rules:

- State the uncertainty or isolated deliverable in the prompt; set a turn limit proportionate to it.
- Run in the foreground unless scopes are independent and the parent will retrieve results before using them.
- For background work, state the ownership split and avoid duplicating that scope.
- Use one writer in the shared tree.
- Prefer fresh context for adversarial review; use inherited context only for session-drift checks.
- Ask the user only for decisions that materially affect scope, product behavior, or risk.

## Skills

Load a skill's instructions with `read` when the task matches. Do not rely on memory for specialized workflows.

Common triggers:

- MCP server setup → `add-mcp-server`
- Creating or substantially rewriting project-level repo instructions → `agents-md`
- Long-running terminals/browser workflows → `cmux`
- Unfamiliar repo or code path requiring convention, entry-point, or validation discovery → `learn-codebase`
- Bug reports, debugging, or performance regressions → `diagnose`
- TDD / test-first / regression-first implementation → `tdd`
- Product/plan clarification with docs, domain language, or decision records → `grill-with-docs`
- Architecture review/improvement, cohesion, coupling, seams, deepening modules, refactoring opportunities, or testability → `improve-codebase-architecture`
- Very terse responses / "caveman mode" / lower-token communication → `caveman`
- Teaching a skill or concept over multiple sessions → `teach`
- Session history analysis → `session-reader`
- Starting work on a new branch or Jira issue → `create-branch`
- Reviewing a branch, PR, or work-in-progress changes → `review`
- Sentry stack traces, production exceptions, or "fix this Sentry issue" → `sentry-fix-issues`
- Figma implementation or visual alignment → `figma-design-to-code`
- Searching, creating, or organizing Obsidian notes → `obsidian-vault`
- Authoring a new agent skill → `write-a-skill`

Skill locations and availability can vary by machine; check the current skill list rather than hardcoding paths or assuming a skill exists.

## Tool Selection

Use the right tool for the job and avoid tool calls that only add noise.

- **File reads**: use `read` for specific files; use `rg`, `find`, or `ls` via shell for discovery.
- **Edits**: use `edit` for precise replacements; use `write` only for new files or intentional full rewrites.
- **Shell**: use targeted commands. Avoid broad, slow, or destructive commands unless the task requires them.
- **Docker**: inspect the repository's Compose files and use its documented service names. Use `bash` for short, non-interactive `docker compose exec` or `docker compose run --rm` commands. Use `interactive_shell` for container shells, REPLs, debuggers, prompts, followed logs, watchers, and long-running commands.
- **Python**: prefer `uv` workflows (`uv run`, `uv add`, `uv sync`, `uv venv`) over raw Python, pip, or Poetry commands when practical.
- **Web**: use `web_search`/`web_fetch` only for current or external facts, documentation, standards, and third-party APIs — not for repo-local questions.
- **Visual UI changes**: prefer one direct browser or screenshot check after the smallest implementation over another planning subagent. Verify the affected state at relevant viewport sizes before redesigning adjacent controls.
- **MCP**: prefer configured MCP tools for external systems they cover; do not scrape or manually work around an available MCP integration.
- **Interview**: use `interview` when structured input is better than chat. Prefer it when there are 2+ independent decisions, options with meaningful tradeoffs, UX/product/scope/risk choices, or recommendations the user should review before answering. Ask directly in chat only for one short clarification or a yes/no decision.
- **Interactive shell**: use `interactive_shell` when a terminal process needs input, live observation, takeover, or background monitoring. Prefer its deferred loader when the tool is inactive.
- **cmux**: use for workflows that need multiple terminals, an embedded browser, or workspace-level coordination beyond one PTY session.

## Safety Rails

Safety extensions may block or prompt for sensitive operations. Treat that as a signal to reassess scope and risk, not as friction to bypass.

- Protected paths include secrets, `.env*`, `.git/`, `.ssh/`, vendored dependencies, lockfiles, and generated schema artifacts.
- Permission gates apply to destructive or high-risk actions such as `rm -rf`, `sudo`, unsafe chmod/chown, force pushes, destructive Docker, database resets, and cluster deletes.
- Never expose secrets in output. If a secret is encountered, stop using it, avoid repeating it, and report only that a secret-like value exists and where it was found.

## Pi Runtime Configuration

Do not duplicate live model, package, or extension configuration in this guide. Check `~/.pi/agent/settings.json`, project `.pi/settings.json`, or tool discovery commands when runtime details matter.

## Research

- Prefer `web_search` to find sources, then `web_fetch` for the specific pages you need.
- Use `get_web_content` to retrieve stored full content from earlier web tool calls.
- Cite or summarize only sources you actually fetched or inspected.
- When working on Pi itself, read the relevant Pi docs and follow linked `.md` references before changing code.

## Commits

- Use the `commit` skill for every commit.
- Descriptive subject and body — no one-word messages.
- One logical change per commit. Don't bundle unrelated edits.

## Completion Summary

On finishing a task, report only what is useful for handoff:

- **What changed** — files touched and the behavioral delta.
- **Verification** — exact commands/checks run and the observed result; do not imply unrun tests passed.
- **Risks / gaps** — skipped validation with reasons, known edge cases, blockers, or follow-ups.
- **Next todos** — for longer tasks only, list up to five concrete follow-ups.

If no files changed, say so. If verification was not run, state why.
