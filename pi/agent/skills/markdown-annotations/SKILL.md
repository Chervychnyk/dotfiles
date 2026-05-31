---
name: markdown-annotations
description: Use when the user provides markdown annotations, review notes, checklist edits, line comments, or bounded patch instructions to apply.
---

# Markdown Annotations

Treat annotations as a bounded patch list, not a new discovery phase.

## Rules

- Apply only the requested annotations unless a note is impossible, ambiguous, or conflicts with correctness.
- Do not opportunistically refactor nearby code.
- Preserve unrelated wording, formatting, and behavior.
- If two annotations conflict, stop and ask for the smallest clarifying decision.
- If an annotation references a stale line or section, locate the likely target and state the mapping.
- Keep edits atomic and easy to review.

## Workflow

1. Parse annotations into a numbered checklist.
2. Map each note to the target file/section/line.
3. Apply each change minimally.
4. Verify the requested text or behavior changed.
5. Report completed, skipped, and ambiguous annotations.

## Output Format

### Applied
- Annotation number: file/section changed

### Skipped / Needs Clarification
- Annotation number: reason

### Verification
- Checks run or direct inspection performed
