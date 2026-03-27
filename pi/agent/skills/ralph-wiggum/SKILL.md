---
name: ralph-wiggum
description: Use for long-running, iterative, verifiable work that should proceed in paced passes with explicit progress tracking. Best when the user wants an autonomous loop, repeated implementation passes, checklist-driven execution, or periodic reflection.
---

# Ralph Wiggum

Use the local Ralph loop extension in `pi/agent/extensions/ralph-wiggum.ts` for substantial work that benefits from repeated iterations.

## When to use

Use Ralph when:

- the task is too large for one clean pass
- the work can be broken into checklist items or milestones
- the user wants autonomous repeated progress
- the task benefits from periodic reflection and replanning
- progress can be verified between iterations

Good examples:

- large refactors
- multi-file migrations
- implementing a plan in stages
- fixing many related issues across a codebase
- long audits or cleanup passes with a checklist

## When not to use

Do not use Ralph when:

- the task is a small one-shot edit
- requirements are still unclear
- the user wants close manual steering each step
- there is no clear way to verify progress
- a normal subagent task or direct implementation is simpler

## Local behavior notes

This local Ralph implementation has important semantics:

- only one Ralph loop should be active at a time
- starting or resuming one loop pauses other active Ralph loops
- `/ralph stop` pauses the current loop
- `/ralph-stop` ends the active loop when the agent is idle
- `/ralph resume <name>` resumes the current iteration and does **not** consume a new iteration
- `ralph_done` is what advances the loop to the next iteration
- the completion marker is `<promise>COMPLETE</promise>`

## Commands

- `/ralph start <name|path> [--items-per-iteration N] [--reflect-every N] [--max-iterations N]`
- `/ralph resume <name>`
- `/ralph stop`
- `/ralph-stop`
- `/ralph status`
- `/ralph cancel <name>`
- `/ralph archive <name>`
- `/ralph clean [--all]`
- `/ralph list --archived`
- `/ralph nuke --yes`

## Tools

### `ralph_start`
Start a loop programmatically.

Use it when the user explicitly wants an iterative loop or when you have already prepared a concrete markdown task with goals/checklist.

Provide:

- `name`
- `taskContent`
- optionally `itemsPerIteration`
- optionally `reflectEvery`
- optionally `maxIterations`

### `ralph_done`
Advance to the next iteration.

Only call this after real progress has been made in the current iteration.
Do not call it if:

- there is no active loop
- pending messages are already queued
- you are fully done and should emit the completion marker instead

## Recommended workflow

1. Create a markdown task with:
   - task summary
   - goals
   - checklist
   - notes / progress section
2. Start Ralph with a reasonable iteration size.
3. During each pass:
   - work on the next chunk
   - update the task file with progress
   - verify what changed where practical
4. If fully complete, respond with `<promise>COMPLETE</promise>`.
5. Otherwise call `ralph_done`.

## Prompting guidance

When creating Ralph tasks:

- prefer concrete checklist items over vague goals
- include validation expectations when known
- keep iteration sizes modest
- use reflection for long or risky work
- make completion criteria explicit

A good task file usually includes:

- scope
- constraints
- checklist items
- verification steps
- notes on blockers or follow-ups

## Safety / quality guidance

- keep the loop grounded in the task file; update it every iteration
- do not hide uncertainty — note blockers in the task file
- avoid infinite churn; stop when complete or when max iterations is reached
- if the loop drifts, pause and revise the checklist before continuing
