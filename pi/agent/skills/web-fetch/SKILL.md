---
name: web-fetch
description: Use the web_fetch tool to retrieve a URL and extract readable markdown, text, html, or json.
---

# web-fetch

Use the `web_fetch` extension tool when you need to read the contents of a URL.

## Preferred tool

- `web_fetch`
  - `url` — URL to fetch
  - `format` — `markdown`, `text`, `html`, `json`, or `image`
  - `selector` — optional CSS selector for a specific part of the page
  - `timeout` — optional request timeout in milliseconds
  - `maxChars` — optional character cap for text output

## Guidance

- Prefer `markdown` for readable article/page content.
- Use `text` for plain extraction, `html` for raw markup, and `json` for API responses.
- Use `selector` when the user wants a specific page region such as `article`, `main`, or `#content`.
- Pair with `web_search` when you need to discover the right URL first.
