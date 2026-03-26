import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { StringEnum } from '@mariozechner/pi-ai'
import { Text } from '@mariozechner/pi-tui'
import { Type } from '@sinclair/typebox'
import {
  DEFAULT_TIMEOUT,
  createAbortController,
  renderBadges,
  truncateForModel,
  truncateText,
} from './shared.ts'
import {
  MAX_SEARCH_LIMIT,
  SEARCH_PROVIDER_NAMES,
  clampSearchLimit,
  type SearchProvider,
  type SearchResultItem,
  resolveSearchProvider,
} from './providers/index.ts'

const DEFAULT_SEARCH_LIMIT = 5

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
          description: `Maximum number of results to return (default: ${DEFAULT_SEARCH_LIMIT}, max: ${MAX_SEARCH_LIMIT})`,
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
      const requestedLimit = params.limit ?? DEFAULT_SEARCH_LIMIT
      const limit = clampSearchLimit(requestedLimit)
      const timeoutMs = params.timeout ?? DEFAULT_TIMEOUT
      const maxChars = params.maxChars
      const provider = resolveSearchProvider(params.provider)

      if (!query) throw new Error('Search query cannot be empty')
      if (!Number.isInteger(requestedLimit) || requestedLimit <= 0) {
        throw new Error(`Invalid result limit: ${requestedLimit}`)
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
