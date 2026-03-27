---
name: bugfix
description: Investigate a bug, plan a minimal fix, implement it, and review the result.
---

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