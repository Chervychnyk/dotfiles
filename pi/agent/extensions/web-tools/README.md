# web-tools extension

Local Pi extension providing:

- `web_search` — web search with provider auto-detection, fallback, diagnostics, and in-memory caching
- `web_fetch` — fetch and extract web pages, JSON, text, HTML, and images with SSRF guardrails and in-memory caching

## File layout

- `index.ts` — extension entrypoint; registers both tools
- `shared.ts` — common helpers for timeouts, caching, truncation, whitespace cleanup, and render badges
- `web-search.ts` — `web_search` tool implementation
- `providers/` — search provider resolution plus one file per provider implementation
- `web-fetch.ts` — `web_fetch` tool implementation

## Development

Run lightweight structural tests:

```bash
npm test
```

Note: tests are structural/unit-style checks for parsing, cache helpers, redirect handling, Cloudflare retry flow, and fetch guard helpers. They do not hit live provider APIs.

## Search providers

`web_search` supports:

- result limit is clamped to a maximum of 20 across providers for more consistent behavior
- `refresh: true` to bypass cached results
- attempt diagnostics in `details.attempts`
- provider fallback in `auto` mode

Providers:

- `auto` — default; tries configured providers in order, then falls back
- `brave` — requires `BRAVE_API_KEY`
- `kagi` — requires `KAGI_API_KEY`
- `google` — requires `GOOGLE_API_KEY` and `GOOGLE_CX`
- `searxng` — requires `SEARXNG_URL`
- `duckduckgo` — zero-config fallback

Provider selection order for `auto`:

1. Brave
2. Kagi
3. Google CSE
4. SearXNG
5. DuckDuckGo

You can choose a provider via:

- `provider` tool parameter
- `PI_WEB_SEARCH_PROVIDER`

Provider API response formats may evolve over time; the extension uses minimal response-shape parsing to keep this maintainable. Each provider now lives in its own file under `providers/` for easier maintenance.

## Fetch behavior and guardrails

`web_fetch` includes:

- Readability-based extraction
- selector extraction
- markdown conversion with GFM support
- image handling
- Cloudflare retry heuristic
- large response warnings
- HTML parse guardrails for very large pages
- progress updates for resolve/network/response/download/extract/convert stages
- `refresh: true` to bypass cached results

SSRF protections include:

- blocking `localhost` and `*.localhost`
- blocking common container/metadata hostnames like `host.docker.internal` and `metadata.google.internal`
- rejecting private, loopback, link-local, multicast, and reserved IP ranges
- validating every redirect hop before following it
- DNS-based resolution checks before opening the request socket

Very large HTML responses over 5MB are rejected for `markdown`, `text`, and `html` processing to avoid expensive parsing.

## Caching

Caching is process-local and in-memory only.

- `web_search` cache TTL: 5 minutes
- `web_fetch` cache TTL: 10 minutes
- use `refresh: true` to force a fresh request

Cached responses annotate `details.cached` and `details.cacheAgeMs`.
