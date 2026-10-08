---
name: add-mcp-server
description: Add or configure a global or project-local MCP server in Pi. Use for MCP setup, connection, or registration requests.
---

# Add an MCP Server

Use Pi's built-in MCP support. Read the installed Pi version's `docs/mcp.md` before changing configuration when available.

## 1. Choose scope and transport

Infer the scope when context makes it clear; otherwise ask.

- Global: `~/.pi/agent/mcp.json`
- Project: `.pi/mcp.json` in the project root; requires project trust and overrides a global server with the same name

Choose one transport:

- stdio: one executable in `command`, with optional `args`, `env`, and `cwd`
- streamable HTTP: `url`, with optional `headers` and `oauth`

Server names may contain only letters, digits, `_`, and `-`.

## 2. Add the server

Prefer Pi's CLI because it safely merges the entry:

```bash
pi mcp add NAME -- COMMAND ARG...
pi mcp add NAME --url URL
```

Add `--local` for project scope. Use `--env`, `--cwd`, `--header`, `--bearer-token-env-var`, `--oauth-client-id`, `--oauth-client-secret`, `--oauth-callback-port`, and `--exposure` as required. Run `pi mcp add --help` when the exact installed interface matters.

Edit the target `mcp.json` only for fields the CLI does not support, preserving every existing entry. Ask before replacing an existing server unless replacement is explicit.

Keep secrets out of configuration. Reference environment variables as `${NAME}` or use a whole-value `!command`. For bearer authentication, prefer `--bearer-token-env-var NAME`.

Do not add adapter-only fields such as `auth`, `bearerToken`, `bearerTokenEnv`, `lifecycle`, `idleTimeout`, or `debug`. Built-in Pi infers transport from `command` or `url`; optional `type` must be `stdio`, `http`, or `streamable-http`.

## 3. Verify

Run:

```bash
pi mcp list
```

Success requires exit status 0 and the new server reported as connected. If OAuth is required, run `pi mcp login NAME`, ask the user to approve the browser flow, then rerun `pi mcp list`.

Tell the user to run `/reload` or start a new session so an already-running Pi session loads the changed server. Report the scope, server name, transport, verification result, and any remaining sign-in or environment-variable requirement.
