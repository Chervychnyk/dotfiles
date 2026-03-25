---
name: learn-codebase
description: Use when asked to understand a repository before coding, to find project conventions, or to discover instruction files and likely implementation areas.
---

# Learn the Codebase

Understand the repository's instructions, conventions, and likely change points before implementation.

## Step 1: Find Instruction Files

Look for project guidance first. Check for files such as:

- `AGENTS.md`
- `AGENTS.local.md`
- `CLAUDE.md`
- `.cursorrules`
- `.github/copilot-instructions.md`
- `.claude/rules/**`
- `.claude/commands/**`
- `.claude/skills/**`
- `README.md`
- `CONTRIBUTING.md`
- architecture or docs directories relevant to the task

Summarize the instructions that materially affect implementation.

## Step 2: Map the Relevant Surface Area

Identify:

- entry points
- key modules and directories
- important types, classes, or functions
- tests or fixtures related to the task
- external integrations or tooling involved

Prefer concrete paths and symbols over generic summaries.

## Step 3: Infer Conventions

Determine the project's local patterns, including where relevant:

- code organization
- naming conventions
- error handling style
- test structure
- dependency patterns
- configuration layout
- review or release constraints

Only state conventions supported by evidence from the repository.

## Step 4: Suggest Likely Change Points

Point to the files or symbols most likely to be edited for the task.
Include why each location matters.

## Output Format

### Instructions Found
- file path + key rules

### Relevant Files
- file path + why it matters

### Conventions
- concise, evidence-based bullets

### Likely Change Points
- where implementation should start

### Risks / Unknowns
- blockers, ambiguity, missing context

## Rules

- Stay read-only unless the user explicitly asked for implementation.
- Prefer breadth first, then depth on the most relevant files.
- Keep the summary concise and path-first.
