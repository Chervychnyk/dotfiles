---
name: architecture-review
description: Use before non-trivial rewrites, public API changes, integration work, or when asked to inspect design, cohesion, coupling, call graphs, seams, or architecture.
---

# Architecture Review

Review the existing design before proposing implementation.

## Focus Areas

- Public API, routes, commands, jobs, events, or user-facing contracts.
- Call graph and ownership boundaries.
- Data model, persistence, and integration contracts.
- Cohesion: whether related behavior lives together.
- Coupling: framework, network, database, time, randomness, and global state dependencies.
- Seams: injectable clients, adapters, test doubles, fixtures, and production/test boundaries.
- Failure modes, retries, idempotency, authorization, observability, and rollback where relevant.

## Workflow

1. Read the relevant entry points and nearby code before judging.
2. Sketch current behavior and execution flow.
3. Identify weak boundaries, hidden coupling, and unclear ownership.
4. Propose 1-3 design options when tradeoffs are real.
5. Recommend one option and explain why.
6. Define the smallest safe vertical slice to prove the direction.

## Output Format

### Current Shape
- Entry points, call graph, data flow, and dependencies

### Design Issues
- Evidence-backed cohesion, coupling, or correctness risks

### Options
1. Option, benefits, costs, risks
2. Option, benefits, costs, risks

### Recommendation
- Preferred shape and why

### Seams and Tests
- Production adapters, test doubles, and verification strategy

### First Slice
- Smallest implementation step that proves the design
