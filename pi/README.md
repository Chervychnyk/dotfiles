# Pi Runtime

This directory is the **Pi runtime** restored by this dotfiles repo. `setup.sh` links it to `~/.pi`.

Use this file as the interface for the runtime. The JSON, TypeScript, and Markdown files below are implementation details behind that interface.

## Runtime map

| Area | Files | Purpose |
| --- | --- | --- |
| Core settings | `agent/settings.json` | Default provider/model, package list, theme, startup, steering, and code-preview preferences. |
| Operating guide | `agent/AGENTS.md` | Global instructions loaded into agent sessions. |
| Custom agents | `agent/agents/*.md` | Role-specific agents for scout, planning, implementation, review, and spec work. See `agent/agents/README.md`. |
| Extensions | `agent/extensions/**` | Local Pi extensions that add tools, UI, safety, context, and workflow behavior. |
| Sandbox policy | `agent/sandbox.settings.json`, `agent/extensions/sandbox/**` | Filesystem and network rules enforced before tool execution. |
| Safety stack | `agent/extensions/SAFETY.md` | The modules that deny, prompt, or advise around risky tool use. |
| Web tools | `agent/web-tools.json` | Web search/fetch configuration used by the web-tools package. |
| Subagents | `agent/extensions/subagent/config.json`, `agent/agents/*.md` | Subagent package configuration plus local custom agent definitions. |

## Package sources

`agent/settings.json` loads these packages:

- `npm:pi-interview`
- `npm:pi-mcp-adapter`
- `~/code/pi-code-previews`
- `~/code/pi-web-tools`
- `npm:@gotgenes/pi-subagents`

Local path packages assume the corresponding checkout exists on the machine.

## Extension inventory

| Extension | Role |
| --- | --- |
| `auto-session-name.ts` | Session naming. |
| `clipboard.ts` | Clipboard tool support. |
| `cmux.ts` | Long-running terminal/browser workflow support. |
| `context.ts` | Context injection. |
| `custom-footer.ts`, `custom-header.ts`, `usage-bar.ts` | TUI presentation. |
| `diff.ts`, `review.ts`, `handoff.ts`, `session-breakdown.ts`, `session-search.ts` | Session and change-review workflow helpers. |
| `docker-context.ts` | Docker Compose context detection. |
| `go-to-bed.ts` | Late-night advisory/blocking guard. |
| `pi-cloak/` | Secret/path cloaking behavior. |
| `sandbox/` | Runtime filesystem/network sandbox. |
| `subagent/` | Subagent integration. |
| `todos/` | File-backed todo tool. |
| `uv.ts` | Python tooling guardrails. |
| `__lib/` | Shared implementation modules for extensions. |

## Extension settings

**Extension settings** use a three-tier interface when an extension calls `agent/extensions/__lib/extension-settings.ts`:

1. Global: `<agent-dir>/<name>.settings.json`
2. Project: `<repo-root>/.agents/<name>.settings.json`
3. Local: `<repo-root>/.agents/<name>.settings.local.json`

Later tiers override earlier tiers through the extension's merge function. `sandbox` and `todos` use this interface. Static package files such as `agent/extensions/subagent/config.json` and `agent/web-tools.json` are package configuration, not tiered extension settings.

For future local extensions, prefer `__lib/extension-settings.ts` when settings need global/project/local overrides. If a setting has only one adapter, keep it static until a real seam exists.

## Restore and verification

After `./setup.sh`, verify the runtime link and core files:

```bash
test -L ~/.pi
ls ~/.pi/agent/settings.json ~/.pi/agent/AGENTS.md
```

Restore global skills from the tracked lockfile:

```bash
npx skills@latest experimental_install
```

Useful checks:

```bash
npx skills@latest list -g -a pi -a claude-code
npx skills@latest update -g
```
