---
name: diagnose
description: Use for hard bugs, regressions, flaky failures, broken behavior, exceptions, or performance regressions. Establishes a reproduce → hypothesize → instrument → fix → regression-test loop.
---

# Diagnose

A disciplined debugging loop. The core skill is building a fast, deterministic feedback loop before changing code.

## Phase 1 — Build a Feedback Loop

Do not start with a fix. First create an agent-runnable pass/fail signal that demonstrates the user's bug.

Try, in order:

1. Failing test at the seam that reaches the bug.
2. CLI or HTTP invocation with fixture input.
3. Browser/headless script for UI bugs.
4. Replay of captured payloads, traces, logs, or events.
5. Throwaway harness around the smallest runnable subsystem.
6. Stress/property/fuzz loop for nondeterministic failures.
7. Bisection or differential loop when a known-good state exists.

If no loop is possible, stop and ask for the missing artifact or access. Do not proceed on vibes.

## Phase 2 — Reproduce

Run the loop and confirm:

- It fails in the same way the user reported.
- It is deterministic enough to debug.
- The exact symptom is captured.

## Phase 3 — Hypothesize

Generate 3–5 ranked, falsifiable hypotheses before testing one.

Format:

- If `<cause>` is true, then `<probe/change>` should `<observable result>`.

## Phase 4 — Instrument

Probe one hypothesis at a time.

- Prefer debuggers or narrow inspection over logs when available.
- If adding logs, tag them with a unique prefix like `[DEBUG-a4f2]`.
- For performance regressions, establish a baseline measurement before fixing.

## Phase 5 — Fix and Regression Test

- Convert the minimized repro into a failing regression test when a correct seam exists.
- If no correct seam exists, document that architecture gap explicitly.
- Apply the smallest fix.
- Re-run the regression check and the original feedback loop.

## Phase 6 — Cleanup and Post-mortem

Before declaring done:

- Original repro no longer reproduces.
- Regression test passes, or missing seam is documented.
- Debug logs and throwaway harnesses are removed.
- Correct hypothesis is stated in the handoff/commit/MR notes.
- If architecture prevented a good test, recommend `architecture-review` after the fix.
