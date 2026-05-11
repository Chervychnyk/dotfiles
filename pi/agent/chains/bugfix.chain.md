---
name: bugfix
description: Investigate a bug, plan a minimal fix, implement it, and review the result.
---

Use this chain for non-trivial bugs where root cause, safe fix, or regression risk is not already obvious. Keep the fix minimal. The main agent should run `subagent({ action: "list" })` before launch and remain the final decision-maker.

Handoff contract:
- `scout` identifies evidence-backed root cause and validation clues.
- `planner` turns that context into the smallest safe fix plan.
- `worker` implements the approved plan only and verifies focused behavior.
- `reviewer` checks the result against the original bug report, plan, and observed behavior.

## scout
output: context.md

Investigate this bug report: {task}

Return a compact report covering:
- relevant files and symbols
- current behavior and likely root cause
- constraints, traps, and likely change points
- the most relevant tests or validation commands

## planner
reads: context.md
output: plan.md
progress: true

Using context.md, create a minimal, low-risk fix plan for: {task}

Include:
- exact files to change
- implementation steps in order
- targeted verification steps
- any open questions only if they materially affect the fix

## worker
reads: context.md+plan.md
output: result.md
progress: true

Implement the bug fix for: {task}

Follow the plan, keep scope tight, run the most relevant checks you can, and summarize:
- files changed
- what was verified
- any remaining risks or skipped checks

## reviewer
reads: context.md+plan.md+result.md
output: review.md

Review the completed fix for: {task}

Focus on correctness, regressions, edge cases, and whether the verification was sufficient.