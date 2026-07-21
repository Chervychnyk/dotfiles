# Custom Agents

A **custom agent** is a role-specific agent definition under this directory.

This file is the routing interface. Each Markdown file is the role implementation.

## Role matrix

| Agent | Purpose | Tools | Can edit project files? | Context | Use when |
| --- | --- | --- | --- | --- | --- |
| `spec` | Clarify what should be built. | read/search/interview/todo | No | Fresh by default | Scope, intent, requirements, or success criteria are ambiguous. |
| `scout` | Read-only reconnaissance. | read/search/list/bash | No | Fresh by default | The code path or repo conventions are unfamiliar. |
| `planner` | Turn approved scope into an executable plan. | read/search/interview/todo | No | Inherits context | The objective is clear but sequencing, seams, or verification need design. |
| `worker` | Implement a focused task. | read/edit/write/search/bash/todo | Yes | Inherits context | A plan is clear and one writer should modify the tree. |
| `reviewer` | Review completed work. | read/search/bash/todo | No | Fresh by default | Changes need correctness, regression, scope, or verification review. |
| `thermo-nuclear-review-subagent` | Thermo correctness/security branch audit. | read/search/bash | No | Fresh by default | `thermos` needs a diff-scoped bugs, breakages, security, devex, or feature-leak review. |
| `thermo-nuclear-code-quality-review-subagent` | Thermo maintainability branch audit. | read/search/bash | No | Fresh by default | `thermos` needs a strict code-quality, structure, spaghetti, or code-judo review. |

## Routing rules

- Use `spec` before planning when product intent or scope is unclear.
- Use `scout` before touching unfamiliar modules or repo conventions.
- Use `planner` when a change spans multiple files, public interfaces, runtime config, safety behavior, or test strategy.
- Use one `worker` as the writer for a shared tree.
- Use `reviewer` before finalizing risky changes: safety, auth, data integrity, concurrency, migrations, runtime config, or public interfaces.

## Interface discipline

- Keep general operating policy in `../AGENTS.md`.
- Keep role-specific implementation in each custom agent file.
- Do not duplicate routing rules across every agent unless the local role needs a stricter override.
- If a new custom agent is added, update the role matrix before relying on it in `AGENTS.md`.

## Verification

After changing an agent definition, inspect the frontmatter and role matrix together:

```bash
ls pi/agent/agents
```

Then start a Pi session or call the subagent tool in a low-risk repo to confirm the agent is discoverable.
