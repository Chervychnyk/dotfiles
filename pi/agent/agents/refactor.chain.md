---
name: refactor
description: Analyze an existing code path, plan a safe incremental refactor, implement it, and review for behavior preservation.
---

## scout
output: context.md

Analyze this refactor target: {task}

Return a compact report covering:
- relevant files, symbols, and entry points
- current behavior that must be preserved
- existing patterns and dependencies
- risks, coupling, and likely safe seams for refactoring
- the most relevant tests or validation commands

## planner
reads: context.md
output: plan.md
progress: true

Using context.md, produce a safe, incremental refactor plan for: {task}

Include:
- refactor goals and explicit non-goals
- the smallest sequence of low-risk changes
- how behavior will be preserved
- targeted verification steps after each meaningful change

## worker
reads: context.md+plan.md
output: result.md
progress: true

Implement the refactor for: {task}

Preserve existing behavior, keep the refactor incremental, run the most relevant checks you can, and summarize:
- files changed
- structural improvements made
- what was verified
- any remaining risks or follow-up cleanup opportunities

## reviewer
reads: context.md+plan.md+result.md
output: review.md

Review the completed refactor for: {task}

Focus on behavior preservation, regressions, accidental scope expansion, and whether the verification was sufficient.