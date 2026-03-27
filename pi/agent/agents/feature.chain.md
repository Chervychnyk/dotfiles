---
name: feature
description: Analyze a feature request, plan the work, implement it, and review the result.
---

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
- ordered implementation steps
- targeted verification steps
- rollout or regression risks if relevant

## worker
reads: context.md+plan.md
output: result.md
progress: true

Implement the feature for: {task}

Follow the plan, keep the change minimal but complete, run the most relevant checks you can, and summarize:
- files changed
- behavior added or updated
- what was verified
- remaining risks or skipped checks

## reviewer
reads: context.md+plan.md+result.md
output: review.md

Review the completed feature work for: {task}

Focus on correctness, regressions, consistency with existing patterns, and whether the verification was sufficient.