# permissions.d

Split permissions rules into focused files.

## Load order (first match wins)

Rules are loaded in lexicographic filename order:

1. `10-secrets.json`
2. `20-tools.json`
3. `...`

Because matching is **first-match wins**, keep the final fallback rule in the highest-numbered file, typically:

```json
{ "tool": "*", "action": "allow" }
```

## Recommended naming

- `10-secrets.json` — secret/env file protections
- `20-tools.json` — risky command/tool policies
- `30-project.json` — project-specific rules
- `99-default.json` — wildcard fallback (if you want it isolated)

## Rule tips

- Put **reject** rules before **ask**/**allow** rules.
- Keep `bash` rules in `matches.cmd`.
- Keep `read/write/edit` rules in `matches.path`.
- Use `/permissions validate` after edits.

## Sources precedence

When running in a project, the extension checks sources in this order:

1. `./.pi/permissions.d/*.json`
2. `./.pi/permissions.json`
3. `~/.pi/agent/permissions.d/*.json`
4. `~/.pi/agent/permissions.json`
5. built-in defaults
