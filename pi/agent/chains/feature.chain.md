---
name: feature
description: Analyze a feature request, plan the work, implement it, and review the result.
---

Use this chain for clear feature requests that need codebase analysis, planning, implementation, and review. If product intent or scope is ambiguous, run `spec` before this chain. Prefer vertical slices over broad implementation: one targeted failing or missing check, one minimal implementation, one passing verification, then the next slice. The main agent should run `subagent({ action: "list" })` before launch and remain the final decision-maker.

Handoff contract:
- `scout` maps affected files, patterns, boundaries, and validation clues.
- `planner` converts that context into a scoped implementation plan with public API, call graph, seams/adapters, and vertical slices when useful.
- `worker` implements the approved plan only, slice by slice, and verifies focused behavior.
- `reviewer` checks the result against the original request, plan, and user-visible behavior.

## scout
output: context.md

Analyze the codebase impact of this feature request: {task}

Return a compact report covering:
- relevant files and entry points
- existing patterns to follow
- dependencies and architectural boundaries
- likely change points
- the most relevant tests or validation commands

## planner
reads: context.md
output: plan.md
progress: true

Using context.md, produce an implementation plan for: {task}

Include:
- scope boundaries and assumptions
- public API / entry points, call graph, and seams/adapters where relevant
- ordered vertical slices with expected checks
- targeted verification steps
- rollout or regression risks if relevant

## worker
reads: context.md+plan.md
output: result.md
progress: true

Implement the feature for: {task}

Follow the plan, keep the change minimal but complete, implement in vertical slices where the plan allows, run the most relevant checks you can, and summarize:
- files changed
- behavior added or updated
- what was verified
- remaining risks or skipped checks

## reviewer
reads: context.md+plan.md+result.md
output: review.md

Review the completed feature work for: {task}

Focus on correctness, regressions, consistency with existing patterns, and whether the verification was sufficient.