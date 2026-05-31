---
name: tdd
description: Use when the user asks for TDD, test-first development, regression-first bug fixes, or careful vertical-slice implementation with tests.
---

# TDD

Use test-driven development as an engineering loop, not as a slogan.

## Philosophy

Tests should verify behavior through public interfaces, not implementation details. A good test reads like a specification and survives internal refactors. A bad test breaks when private structure changes but user-visible behavior does not.

## Principles

- One behavior per slice.
- Prefer a meaningful failing test or executable check before implementation when practical.
- The test should describe externally observable behavior, not private implementation details.
- Use project domain language in test names and assertions; check `CONTEXT.md` and ADRs when present.
- Avoid broad mocks that prove the mock instead of the system.
- Mock at real seams only. One adapter is usually a hypothetical seam; two adapters make the seam real.
- Use seams deliberately: inject clocks, clients, storage, and network boundaries only where they make behavior testable without distorting production code.
- Keep refactors separate from behavior changes unless the current design blocks the next slice.

## Workflow

1. Identify the next smallest user-visible behavior or regression.
2. Locate the narrowest existing test layer that can exercise it through a public interface.
3. Add or update one targeted failing check.
4. Run that check and confirm it fails for the expected reason.
5. Implement the smallest production change that can pass it; do not anticipate future tests.
6. Run the targeted check again.
7. Refactor only after green, and rerun checks after each refactor step.
8. Repeat for the next behavior.

## When Test-First Is Not Practical

If the project lacks test infrastructure, the behavior is UI-only, or the check would be disproportionately expensive:

- State why a failing test was skipped.
- Use the closest executable verification available.
- Prefer adding a lightweight characterization or regression check if feasible.

## Anti-patterns

- Writing many tests before any implementation feedback; this is horizontal slicing, not TDD.
- Testing imagined data shapes or function signatures before discovering the real behavior.
- Adding snapshot or fixture churn that does not assert the new behavior.
- Mocking the unit under test or internal collaborators that are not real seams.
- Treating private method coverage as proof of user-visible behavior.
- Continuing after a test fails for an unexpected reason without investigating.

## Output Expectations

Report:

- The slice implemented.
- The failing check added or why it was skipped.
- The implementation change.
- The passing verification command and result.
- Remaining slices or risks.
