# Pi Permission Auto Mode

A local Pi extension that registers the `auto-mode` authorizer link with
`@gotgenes/pi-permission-system`. When enabled, it asks either a JEV-compatible
System One endpoint or a small chat model from Pi's model registry to resolve
permission requests that would otherwise prompt the user.

Auto mode is **disabled by default**. Deterministic permission-system rules still
run first, and this link sees only `ask` decisions. Any uncertainty or failure
falls through to the normal human prompt.

## Requirements

- Pi 0.99.1
- `@gotgenes/pi-permission-system` 33.1.1
- Node.js 22 or newer

The parent `extensions` directory discovers this package's `index.ts`
automatically. The permission-system config must contain:

```json
{
  "authorizerChain": ["auto-mode"]
}
```

Registration alone does not enable decisions; use `/auto-mode on`.

## Commands and status

```text
/auto-mode
/auto-mode status
/auto-mode on
/auto-mode off
```

`on` and `off` are session-only and do not rewrite configuration. The footer
shows `auto-mode: off` or the enabled backend, such as
`auto-mode: on (jev/tev1)`.

## Configuration

Edit `config.json`; `schemas/config.schema.json` documents the complete shape.
The shipped configuration is:

```json
{
  "$schema": "./schemas/config.schema.json",
  "enabled": false,
  "backend": {
    "type": "jev",
    "endpoint": "http://127.0.0.1:11434/v1/systemone",
    "model": "tev1"
  },
  "timeoutMs": 5000,
  "maxCommandBytes": 8192,
  "allowThreshold": 0.9,
  "denyThreshold": 0.98
}
```

### JEV System One

The JEV backend sends a direct `POST` request to the complete URL in `endpoint`.
It uses a choice question with `allow`, `deny`, and `ask` criteria and
conservatively uses the lower of the returned choice probability and reported
confidence.

Any host implementing the JEV/System One contract can provide the endpoint.
For example, Ollama exposes `http://127.0.0.1:11434/v1/systemone`; `tev1`,
`tev1:0.8b`, and `nimble` are example compatible decision models.

### Pi model-registry LLM

To use a configured small model such as `gpt-5.4-mini`:

```json
{
  "enabled": false,
  "backend": {
    "type": "llm",
    "provider": "openai",
    "model": "gpt-5.4-mini"
  },
  "timeoutMs": 5000,
  "maxCommandBytes": 8192,
  "allowThreshold": 0.9,
  "denyThreshold": 0.98
}
```

This backend resolves credentials and the model through Pi's model registry. It
requests a constrained structured tool result containing a decision and
confidence. Free text, missing tools, unknown models, provider errors, and
malformed results all defer.

## Safety properties

- `path*` and `external_directory*` asks always defer to the user.
- The model receives normalized permission request facts only. It never receives
  guidance files, file contents, tool results, or the session transcript.
- Command-bearing request facts must fit `maxCommandBytes` without truncation.
  Bash requests may additionally include exact `full command` evidence only
  when it fits the same limit.
- With the shipped configuration, allow requires confidence `>= 0.90`; deny
  requires the stricter `>= 0.98`. `ask` and lower confidence always defer.
- Network failures, timeouts, unavailable models, malformed JSON, missing tool
  calls, and all other backend errors defer.
- Review entries contain only request ID, backend type, outcome, reason code,
  confidence, and latency. Commands, model replies, errors, and file data are
  not logged by this extension.

## Development

```bash
npm install
npm run check
npm test
```
