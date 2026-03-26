# web-tools extension

Local Pi extension providing:

- `web_search` — web search with provider auto-detection and truncation support
- `web_fetch` — fetch and extract web pages, JSON, text, HTML, and images

## File layout

- `index.ts` — extension entrypoint; registers both tools
- `shared.ts` — common helpers for timeouts, truncation, whitespace cleanup, and render badges
- `web-search.ts` — `web_search` tool implementation
- `providers/` — search provider resolution plus one file per provider implementation
- `web-fetch.ts` — `web_fetch` tool implementation

## Development

Run lightweight structural tests:

```bash
npm test
```

Note: tests are structural/unit-style checks for parsing and guard helpers. They do not hit live provider APIs.

## Search providers

`web_search` supports:

- result limit is clamped to a maximum of 20 across providers for more consistent behavior

- `auto` — default; picks the first configured provider below
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

## Fetch guardrails

`web_fetch` includes:

- Readability-based extraction
- selector extraction
- markdown conversion with GFM support
- image handling
- Cloudflare retry heuristic
- large response warnings
- HTML parse guardrails for very large pages

Very large HTML responses over 5MB are rejected for `markdown`, `text`, and `html` processing to avoid expensive parsing.
