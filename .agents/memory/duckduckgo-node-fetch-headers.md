---
name: DuckDuckGo headers for server-side fetch
description: html.duckduckgo.com returns 202 anti-bot responses from Node.js fetch unless the request includes browser-like headers.
---

When fetching `https://html.duckduckgo.com/html/?q=...` from a Node.js backend (e.g. Express `fetch`), send these headers to avoid DuckDuckGo's 202 anti-bot response:

- `User-Agent`: a current Chrome UA string
- `Accept`: `text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8`
- `Accept-Language`: `en-US,en;q=0.9`
- `Cookie`: `kl=wt-wt`

**Why:** Without them, DuckDuckGo returns HTTP 202 with a generic page instead of the search results, so regex scrapers fail silently with zero matches.

**How to apply:** Add the headers to the `fetch` call in any server-side DDG scraper (e.g. `artifacts/api-server/src/routes/iskills2/index.ts`). Keep the existing `encodeURIComponent` on the query and maintain the fallback to an empty results array on failure.