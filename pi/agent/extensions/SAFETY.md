# Safety Stack

The **safety stack** is the set of modules that deny, prompt, or advise around risky Pi tool use.

This file is the interface for understanding safety behavior. Individual extension files are implementation details.

## Stack

| Module | Files | Scope | Outcome | Persistence |
| --- | --- | --- | --- | --- |
| Sandbox policy | `sandbox/`, `../sandbox.settings.json` | Filesystem reads/writes, network domains, Unix sockets, local binding. | Deny or prompt through the sandbox runtime before tool execution. | Global/project/local sandbox settings plus prompt-persisted grants. |
| Late-night guard | `go-to-bed.ts` | Tool execution during quiet hours. | Advisory pushback, then temporary blocking until explicit continuation. | In-memory per night/session. |
| Cloaking | `pi-cloak/` | Secret/path redaction and exposure reduction. | Hide sensitive values from display or model context. | Extension implementation. |
| Operating rules | `../AGENTS.md` | Agent behavior around permission errors, secrets, destructive commands, and verification. | Instruction-level policy; stop or ask rather than work around. | Markdown instructions in this repo. |

## Expected precedence

Treat the stack as defense in depth, not as one replaceable module.

1. **Sandbox policy** owns OS/runtime capability: filesystem and network access.
2. **Late-night guard** owns time-based interruption and confirmation.
3. **Cloaking** owns reducing sensitive content exposure.
4. **Operating rules** own what the agent should do when any safety module blocks or warns.

If more than one module can block the same action, any block is authoritative. Do not add workarounds that try another path after a denial, permission error, sandbox error, or operation-not-permitted result.

## Outcome vocabulary

- **Hard deny**: the action must not run.
- **Prompt**: the user must decide before the action runs.
- **Advisory**: the agent receives instruction or warning; progress may continue only under that instruction.
- **Cloak**: sensitive content is hidden or transformed before exposure.

## Current seams

- The sandbox module has a real seam at filesystem/network policy because production runtime behavior and test/prompt behavior vary behind it.
- Late-night guard is intentionally in-memory. Persisting it would be a new policy decision, not a refactor.
- Cloaking should stay independent from permission decisions: hiding content and authorizing actions are different modules.

## Verification checks

Use the narrowest check for the module being changed:

```bash
node --check pi/agent/extensions/go-to-bed.ts
node pi/agent/extensions/sandbox/tests/check.mjs
```

For documentation or config-only edits, also inspect the effective files linked by setup:

```bash
test -L ~/.pi
ls ~/.pi/agent/extensions ~/.pi/agent/sandbox.settings.json
```

## Change rules

- Prefer documenting a new safety interaction here before changing implementation.
- Keep persistence location explicit for every prompt or grant.
- Keep deny/prompt/advisory behavior separate; do not merge them under one vague permission term.
- If a change makes block order user-visible, record that order here.
