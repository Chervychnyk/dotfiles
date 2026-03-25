import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { StringEnum } from '@mariozechner/pi-ai'
import { Text } from '@mariozechner/pi-tui'
import { Type } from '@sinclair/typebox'
import * as cheerio from 'cheerio'
import {
  DEFAULT_TIMEOUT,
  createAbortController,
  normalizeWhitespace,
  renderBadges,
  truncateForModel,
  truncateText,
} from './shared.ts'

const DEFAULT_SEARCH_LIMIT = 5
const SEARCH_USER_AGENT = 'pi-web-search/1.1 (+https://duckduckgo.com)'

type SearchResultItem = {
  title: string
  url: string
  snippet: string
}

export const SEARCH_PROVIDER_NAMES = [
  'auto',
  'duckduckgo',
  'brave',
  'kagi',
  'google',
  'searxng',
] as const

type SearchProviderName = (typeof SEARCH_PROVIDER_NAMES)[number]

type SearchProvider = {
  name: Exclude<SearchProviderName, 'auto'>
  search: (
    query: string,
    limit: number,
    signal: AbortSignal,
  ) => Promise<SearchResultItem[]>
}

export type SearchDetails = {
  query: string
  count: number
  results: SearchResultItem[]
  provider: SearchProvider['name']
  truncated: boolean
  tempFile?: string
  totalBytes: number
  totalLines: number
  maxChars?: number
  charLimited: boolean
  originalChars: number
}

export function unwrapDuckDuckGoUrl(rawUrl: string): string {
  const cleaned = rawUrl.replace(/&amp;/g, '&')

  try {
    const absolute = cleaned.startsWith('//') ? `https:${cleaned}` : cleaned
    const parsed = new URL(absolute, 'https://duckduckgo.com')
    const redirect = parsed.searchParams.get('uddg')
    return redirect ? decodeURIComponent(redirect) : absolute
  } catch {
    return cleaned
  }
}

export function dedupeResults(items: SearchResultItem[], limit: number) {
  const deduped: SearchResultItem[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const title = normalizeWhitespace(item.title || '')
    const url = item.url || ''
    const snippet = normalizeWhitespace(item.snippet || '')

    if (!title || !url) continue
    const key = `${title}\u0000${url}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push({ title, url, snippet })
    if (deduped.length >= limit) break
  }

  return deduped
}

export function parseDuckDuckGoResults(html: string, limit: number) {
  const $ = cheerio.load(html)
  const results: SearchResultItem[] = []

  $('a.result__a').each((_, element) => {
    if (results.length >= limit) return false

    const anchor = $(element)
    const title = normalizeWhitespace(anchor.text())
    const url = unwrapDuckDuckGoUrl(anchor.attr('href') || '')
    const container = anchor.closest('.result')
    const snippet = normalizeWhitespace(
      container.find('.result__snippet').first().text() ||
        container.find('[class*="snippet"]').first().text() ||
        '',
    )

    if (!title || !url) return
    results.push({ title, url, snippet })
  })

  return dedupeResults(results, limit)
}

async function parseJsonResponse(response: Response) {
  try {
    return await response.json()
  } catch {
    throw new Error('Search provider returned invalid JSON')
  }
}

export function parseBraveResults(json: any, limit: number) {
  const items = Array.isArray(json?.web?.results) ? json.web.results : []
  return dedupeResults(
    items.map((item: any) => ({
      title: item?.title || '',
      url: item?.url || '',
      snippet: item?.description || item?.snippet || '',
    })),
    limit,
  )
}

export function parseKagiResults(json: any, limit: number) {
  const items = Array.isArray(json?.data) ? json.data : []
  return dedupeResults(
    items.map((item: any) => ({
      title: item?.title || '',
      url: item?.url || '',
      snippet: item?.snippet || item?.description || '',
    })),
    limit,
  )
}

export function parseGoogleResults(json: any, limit: number) {
  const items = Array.isArray(json?.items) ? json.items : []
  return dedupeResults(
    items.map((item: any) => ({
      title: item?.title || '',
      url: item?.link || '',
      snippet: item?.snippet || '',
    })),
    limit,
  )
}

export function parseSearXngResults(json: any, limit: number) {
  const items = Array.isArray(json?.results) ? json.results : []
  return dedupeResults(
    items.map((item: any) => ({
      title: item?.title || '',
      url: item?.url || '',
      snippet: item?.content || '',
    })),
    limit,
  )
}

function createDuckDuckGoProvider(): SearchProvider {
  return {
    name: 'duckduckgo',
    async search(query, limit, signal) {
      const response = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        {
          signal,
          headers: {
            'User-Agent': SEARCH_USER_AGENT,
            Accept: 'text/html,application/xhtml+xml',
          },
        },
      )

      if (!response.ok) {
        throw new Error(
          `DuckDuckGo search failed: ${response.status} ${response.statusText}`,
        )
      }

      const html = await response.text()
      return parseDuckDuckGoResults(html, limit)
    },
  }
}

function createBraveProvider(apiKey: string): SearchProvider {
  return {
    name: 'brave',
    async search(query, limit, signal) {
      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
        {
          signal,
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': apiKey,
            'User-Agent': SEARCH_USER_AGENT,
          },
        },
      )

      if (!response.ok) {
        throw new Error(
          `Brave search failed: ${response.status} ${response.statusText}`,
        )
      }

      return parseBraveResults(await parseJsonResponse(response), limit)
    },
  }
}

function createKagiProvider(apiKey: string): SearchProvider {
  return {
    name: 'kagi',
    async search(query, limit, signal) {
      const response = await fetch(
        `https://kagi.com/api/v0/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        {
          signal,
          headers: {
            Accept: 'application/json',
            Authorization: `Bot ${apiKey}`,
            'User-Agent': SEARCH_USER_AGENT,
          },
        },
      )

      if (!response.ok) {
        throw new Error(
          `Kagi search failed: ${response.status} ${response.statusText}`,
        )
      }

      return parseKagiResults(await parseJsonResponse(response), limit)
    },
  }
}

function createGoogleProvider(apiKey: string, cx: string): SearchProvider {
  return {
    name: 'google',
    async search(query, limit, signal) {
      const response = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${Math.min(limit, 10)}`,
        {
          signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': SEARCH_USER_AGENT,
          },
        },
      )

      if (!response.ok) {
        throw new Error(
          `Google search failed: ${response.status} ${response.statusText}`,
        )
      }

      return parseGoogleResults(await parseJsonResponse(response), limit)
    },
  }
}

function createSearXngProvider(baseUrl: string): SearchProvider {
  const root = baseUrl.replace(/\/$/, '')
  return {
    name: 'searxng',
    async search(query, limit, signal) {
      const response = await fetch(
        `${root}/search?q=${encodeURIComponent(query)}&format=json&language=en-US&pageno=1`,
        {
          signal,
          headers: {
            Accept: 'application/json',
            'User-Agent': SEARCH_USER_AGENT,
          },
        },
      )

      if (!response.ok) {
        throw new Error(
          `SearXNG search failed: ${response.status} ${response.statusText}`,
        )
      }

      return parseSearXngResults(await parseJsonResponse(response), limit)
    },
  }
}

export function resolveSearchProvider(
  providerName: SearchProviderName | undefined,
): SearchProvider {
  const explicit = (providerName || process.env.PI_WEB_SEARCH_PROVIDER || 'auto')
    .toLowerCase()
    .trim() as SearchProviderName

  const braveKey = process.env.BRAVE_API_KEY
  const kagiKey = process.env.KAGI_API_KEY
  const googleKey = process.env.GOOGLE_API_KEY
  const googleCx = process.env.GOOGLE_CX
  const searxngUrl = process.env.SEARXNG_URL

  const autoProvider = () => {
    if (braveKey) return createBraveProvider(braveKey)
    if (kagiKey) return createKagiProvider(kagiKey)
    if (googleKey && googleCx) return createGoogleProvider(googleKey, googleCx)
    if (searxngUrl) return createSearXngProvider(searxngUrl)
    return createDuckDuckGoProvider()
  }

  switch (explicit) {
    case 'auto':
      return autoProvider()
    case 'duckduckgo':
      return createDuckDuckGoProvider()
    case 'brave':
      if (!braveKey) throw new Error('BRAVE_API_KEY is required for Brave search')
      return createBraveProvider(braveKey)
    case 'kagi':
      if (!kagiKey) throw new Error('KAGI_API_KEY is required for Kagi search')
      return createKagiProvider(kagiKey)
    case 'google':
      if (!googleKey || !googleCx) {
        throw new Error('GOOGLE_API_KEY and GOOGLE_CX are required for Google search')
      }
      return createGoogleProvider(googleKey, googleCx)
    case 'searxng':
      if (!searxngUrl) throw new Error('SEARXNG_URL is required for SearXNG search')
      return createSearXngProvider(searxngUrl)
    default:
      throw new Error(
        `Unknown search provider: ${explicit}. Valid options: auto, duckduckgo, brave, kagi, google, searxng`,
      )
  }
}

function formatSearchResults(query: string, results: SearchResultItem[]) {
  if (!results.length) return `No results found for: ${query}`

  return results
    .map((result, index) => {
      const lines = [`${index + 1}. ${result.title}`, `   ${result.url}`]
      if (result.snippet) lines.push(`   ${result.snippet}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

export function registerWebSearchTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'web_search',
    label: 'Web Search',
    description:
      'Search the web for current information using configurable providers and return titles, URLs, and snippets.',
    promptSnippet:
      'Search the web for current information and documentation results',
    promptGuidelines: [
      'Use this tool when you need current information from the web before citing or fetching a page.',
      'Use web_fetch after this when you need the full contents of a specific result.',
      'Supports provider selection via parameter or environment variables; defaults to auto-detection.',
    ],
    parameters: Type.Object({
      query: Type.String({ description: 'Search query' }),
      provider: Type.Optional(
        StringEnum(SEARCH_PROVIDER_NAMES, {
          description:
            'Optional provider: auto, duckduckgo, brave, kagi, google, searxng. Defaults to auto.',
        }),
      ),
      limit: Type.Optional(
        Type.Number({
          description: `Maximum number of results to return (default: ${DEFAULT_SEARCH_LIMIT})`,
        }),
      ),
      timeout: Type.Optional(
        Type.Number({
          description: `Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT})`,
        }),
      ),
      maxChars: Type.Optional(
        Type.Number({
          description:
            'Optional hard cap for output characters before normal truncation is applied.',
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      const query = params.query.trim()
      const limit = params.limit ?? DEFAULT_SEARCH_LIMIT
      const timeoutMs = params.timeout ?? DEFAULT_TIMEOUT
      const maxChars = params.maxChars
      const provider = resolveSearchProvider(params.provider)

      if (!query) throw new Error('Search query cannot be empty')
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error(`Invalid result limit: ${limit}`)
      }
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`Invalid timeout: ${timeoutMs}`)
      }
      if (
        maxChars !== undefined &&
        (!Number.isInteger(maxChars) || maxChars <= 0)
      ) {
        throw new Error(`Invalid maxChars: ${maxChars}`)
      }

      onUpdate?.({
        content: [
          { type: 'text', text: `Searching ${provider.name} for: ${query}` },
        ],
      })

      const { controller, cleanup } = createAbortController(timeoutMs, signal)

      try {
        const results = await provider.search(query, limit, controller.signal)
        const formatted = formatSearchResults(query, results)
        const output = truncateForModel(formatted, '.txt', maxChars)

        return {
          content: [{ type: 'text', text: output.text }],
          details: {
            query,
            count: results.length,
            results,
            provider: provider.name,
            truncated: output.truncated,
            tempFile: output.tempFile,
            totalBytes: output.totalBytes,
            totalLines: output.totalLines,
            maxChars: output.maxChars,
            charLimited: output.charLimited,
            originalChars: output.originalChars,
          } satisfies SearchDetails,
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new Error(`Search request timed out after ${timeoutMs}ms`)
        }
        throw error
      } finally {
        cleanup()
      }
    },
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('web_search '))
      text += theme.fg('accent', truncateText(args.query, 72))
      const parts: string[] = []
      if (args.provider) parts.push(`provider=${args.provider}`)
      if (args.limit) parts.push(`limit=${args.limit}`)
      if (args.maxChars) parts.push(`maxChars=${args.maxChars}`)
      if (args.timeout) parts.push(`timeout=${args.timeout}ms`)
      if (parts.length) text += theme.fg('dim', ` (${parts.join(', ')})`)
      return new Text(text, 0, 0)
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg('warning', 'Searching...'), 0, 0)

      const details = (result.details || {}) as SearchDetails
      let text = details.count
        ? theme.fg('success', `${details.count} results`)
        : theme.fg('dim', 'No results found')
      if (details.provider) {
        text += ` ${theme.fg('muted', `via ${details.provider}`)}`
      }
      text += renderBadges(theme, details)

      if (expanded && details.results?.length) {
        for (const item of details.results.slice(0, 5)) {
          text += `\n${theme.fg('accent', `• ${item.title}`)}`
          text += `\n${theme.fg('dim', `  ${truncateText(item.url, 120)}`)}`
        }
        if (details.results.length > 5) {
          text += `\n${theme.fg('muted', `... ${details.results.length - 5} more results`)}`
        }
      }

      if (expanded && details.tempFile) {
        text += `\n${theme.fg('muted', `Full output: ${details.tempFile}`)}`
      }

      return new Text(text, 0, 0)
    },
  })
}
