# web-tools extension

Local Pi extension providing:

- `web_search` — web search with provider auto-detection and truncation support
- `web_fetch` — fetch and extract web pages, JSON, text, HTML, and images

## File layout

- `index.ts` — extension entrypoint; registers both tools
- `shared.ts` — common helpers for timeouts, truncation, whitespace cleanup, and render badges
- `web-search.ts` — `web_search` tool implementation and provider selection
- `web-fetch.ts` — `web_fetch` tool implementation

## Development

Run lightweight structural tests:

```bash
npm test
```

## Search providers

`web_search` supports:

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
