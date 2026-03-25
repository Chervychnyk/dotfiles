---
name: web-search
description: Use the web_search tool to search the web for current information and documentation.
---

# web-search

Use the `web_search` extension tool when you need current information from the web.

## Preferred tool

- `web_search`
  - `query` — search terms
  - `limit` — optional result count
  - `timeout` — optional request timeout in milliseconds
  - `maxChars` — optional character cap for formatted search output

## Guidance

- Search first when you need current docs, news, release notes, or recent API information.
- Keep `limit` small unless the user asks for broad exploration.
- Use `web_fetch` after this when you need the full contents of a specific result.
