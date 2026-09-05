---
name: learn-codebase
description: Orient to an unfamiliar repository or code path when task work depends on conventions, architecture, or an unknown validation workflow. Use for onboarding and explicit codebase-orientation requests. Skip for familiar repositories, targeted file edits, direct lookups, documentation-only changes, and tasks whose entry point and validation command are already known.
---

# Learn the codebase

Build only the repository context needed for the current task. Stay read-only. Stop once the applicable rules, relevant code path, runtime, and validation command are known.

## 1. Find applicable instructions

Locate instruction files at the repository root and along the path to files the task may touch:

- `AGENTS.md`, `AGENTS.local.md`, and `AGENTS.override.md`
- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `.cursorrules`
- task-relevant files under `.claude/rules/`, `.cursor/rules/`, and `.pi/`
- repository-specific equivalents named by those files

Follow the harness's precedence rules. Read applicable instruction files fully. Do not inventory unrelated commands, settings, or skills.

## 2. Trace the task's code path

Use repository search and nearby files to identify:

- the user-facing or public entry point;
- the call path and data flow relevant to the task;
- tests that exercise that behavior;
- local naming, structure, and error-handling conventions;
- task-relevant `CONTEXT.md`, ADRs, or architecture documentation.

Read manifests, scripts, and documentation only when they answer one of those questions. Prefer existing implementations over generic assumptions.

## 3. Identify the execution path

Determine the smallest reliable way to work and verify:

- package manager or runtime;
- whether commands run locally or through Docker Compose;
- targeted build, typecheck, lint, or test command;
- required services or fixtures;
- generated or protected files that must not be edited directly.

Try discoverable commands and configuration before asking the user. Do not install dependencies, modify settings, or run broad test suites during orientation.

## 4. Stop and report

Stop reconnaissance when you can name:

1. the applicable repository instructions;
2. the relevant entry point and code path;
3. the conventions the task must follow;
4. the targeted validation command;
5. any unresolved fact that blocks safe implementation.

Return a compact, path-cited summary:

```text
## Orientation
- Rules: [applicable files and key constraints]
- Code path: [entry point and relevant modules]
- Conventions: [task-relevant patterns]
- Validation: [targeted command]
- Unknowns/risks: [only material gaps]
```

If the user requested onboarding rather than a concrete task, broaden the summary to the main entry points, architecture, development commands, and validation workflow. Keep it factual and cite repository paths.

## Boundaries

This skill is not a security audit, dependency audit, architecture review, skill-registration workflow, or implementation plan. Route those requests to their dedicated workflows. Do not modify project files while using this skill.
