import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { formatSize } from '@mariozechner/pi-coding-agent'
import { StringEnum } from '@mariozechner/pi-ai'
import { Text } from '@mariozechner/pi-tui'
import { Type } from '@sinclair/typebox'
import { Readability } from '@mozilla/readability'
import * as cheerio from 'cheerio'
import * as dns from 'node:dns/promises'
import * as http from 'node:http'
import * as https from 'node:https'
import net from 'node:net'
import { JSDOM } from 'jsdom'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import {
  DEFAULT_TIMEOUT,
  buildCacheKey,
  createAbortController,
  getCachedValue,
  normalizeWhitespace,
  renderBadges,
  setCachedValue,
  truncateForModel,
  truncateText,
} from './shared.ts'

const FETCH_USER_AGENT = 'pi-web-fetch/1.1'
const FETCH_USER_AGENT_FALLBACK = 'web_fetch/1.1'
const DEFAULT_IMAGE_FORMAT = 'image'
const FETCH_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_REDIRECTS = 5
const MAX_HTML_BYTES = 5 * 1024 * 1024
const LARGE_RESPONSE_WARNING_BYTES = 1 * 1024 * 1024
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'host.docker.internal',
  'host.containers.internal',
  'metadata.google.internal',
])
const CONTENT_SELECTOR_CANDIDATES = [
  'article',
  'main',
  '[role="main"]',
  '#content',
  '.content',
  '.post-content',
  '.entry-content',
  '.article',
  '.markdown-body',
]

type ArticleData = {
  title: string | null
  byline: string | null
  excerpt: string | null
  siteName: string | null
  contentHtml: string
  textContent: string
  extractionMethod:
    | 'readability'
    | 'selector'
    | 'fallback-selector'
    | 'document'
  selectedSelector?: string
}

export type FetchDetails = {
  url: string
  format: string
  title?: string | null
  byline?: string | null
  siteName?: string | null
  excerpt?: string | null
  selectedSelector?: string
  extractionMethod?: ArticleData['extractionMethod']
  truncated: boolean
  tempFile?: string
  isImage?: boolean
  imageMimeType?: string
  imageSize?: number
  status?: number
  statusText?: string
  contentType?: string
  charLimited?: boolean
  maxChars?: number
  originalChars?: number
  cloudflareBypassed?: boolean
  contentLength?: number
  cached?: boolean
  cacheAgeMs?: number
}

function getDocumentMetadata(html: string, url: string) {
  const dom = new JSDOM(html, { url })
  return {
    title: dom.window.document.title?.trim() || null,
  }
}

function selectFragment(html: string, selector: string) {
  const $ = cheerio.load(html)
  const selected = $(selector)

  if (!selected.length) {
    throw new Error(`No elements found for selector: ${selector}`)
  }

  const outerHtml = selected
    .map((_, element) => $.html(element))
    .get()
    .join('\n')

  const text = normalizeWhitespace(selected.text())

  return { html: outerHtml, text, selector }
}

function findBestContentSelector(html: string) {
  let best: ReturnType<typeof selectFragment> | null = null

  for (const selector of CONTENT_SELECTOR_CANDIDATES) {
    try {
      const current = selectFragment(html, selector)
      if (!current.text) continue
      if (!best || current.text.length > best.text.length) {
        best = current
      }
    } catch {
      // Ignore selectors that don't match.
    }
  }

  return best
}

function extractReadableArticle(html: string, url: string): ArticleData {
  const dom = new JSDOM(html, { url })
  const article = new Readability(dom.window.document).parse()
  const fallbackHtml = dom.window.document.body?.innerHTML || html
  const fallbackText = normalizeWhitespace(
    dom.window.document.body?.textContent || '',
  )

  return {
    title: article?.title?.trim() || dom.window.document.title?.trim() || null,
    byline: article?.byline?.trim() || null,
    excerpt: article?.excerpt?.trim() || null,
    siteName: article?.siteName?.trim() || null,
    contentHtml: article?.content || fallbackHtml,
    textContent: normalizeWhitespace(article?.textContent || fallbackText),
    extractionMethod: article ? 'readability' : 'document',
  }
}

function extractBestHtmlContent(
  html: string,
  url: string,
  selector?: string,
): ArticleData {
  if (selector) {
    const selected = selectFragment(html, selector)
    const metadata = getDocumentMetadata(html, url)
    return {
      title: metadata.title,
      byline: null,
      excerpt: null,
      siteName: null,
      contentHtml: selected.html,
      textContent: selected.text,
      extractionMethod: 'selector',
      selectedSelector: selector,
    }
  }

  const article = extractReadableArticle(html, url)
  const bestSelector = findBestContentSelector(html)

  if (!bestSelector) {
    return article
  }

  const readabilityLength = article.textContent.length
  const selectorLength = bestSelector.text.length
  const shouldPreferSelector =
    selectorLength > 0 &&
    (readabilityLength < 280 || selectorLength > readabilityLength * 1.2)

  if (!shouldPreferSelector) {
    return article
  }

  const metadata = getDocumentMetadata(html, url)
  return {
    title: article.title || metadata.title,
    byline: article.byline,
    excerpt: article.excerpt,
    siteName: article.siteName,
    contentHtml: bestSelector.html,
    textContent: bestSelector.text,
    extractionMethod: 'fallback-selector',
    selectedSelector: bestSelector.selector,
  }
}

function createTurndownService() {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
  })
  service.use(gfm)
  service.addRule('removeEmptyLinks', {
    filter: (node) => node.nodeName === 'A' && !node.textContent?.trim(),
    replacement: () => '',
  })
  return service
}

function cleanupMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const cleaned: string[] = []
  let inFence = false

  for (const rawLine of lines) {
    let line = rawLine.replace(/[ \t]+$/g, '')

    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      cleaned.push(line)
      continue
    }

    if (inFence) {
      cleaned.push(line)
      continue
    }

    line = line.replace(/\[\s*\]\([^)]*\)/g, '')
    line = line.replace(/ {2,}/g, ' ')
    line = line.replace(/\s+([,.;:!?])/g, '$1')

    if (line.trim() === '') {
      if (cleaned[cleaned.length - 1] !== '') cleaned.push('')
      continue
    }

    cleaned.push(line)
  }

  return cleaned
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extensionForFormat(format: string): string {
  switch (format) {
    case 'markdown':
      return '.md'
    case 'html':
      return '.html'
    case 'json':
      return '.json'
    case 'image':
      return '.txt'
    default:
      return '.txt'
  }
}

export type GuardedFetchResponse = {
  url: string
  status: number
  statusText: string
  headers: Headers
  ok: boolean
  bodyBuffer: Buffer
}

export type GuardedRequester = (
  url: URL,
  signal: AbortSignal,
  userAgent: string,
) => Promise<GuardedFetchResponse>

function normalizeHostname(hostname: string) {
  return hostname.trim().replace(/\.+$/g, '').toLowerCase()
}

export function isBlockedHostname(hostname: string) {
  const normalized = normalizeHostname(hostname)
  return (
    !normalized ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    BLOCKED_HOSTNAMES.has(normalized)
  )
}

function normalizeIpAddress(address: string) {
  const normalized = address.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1')
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return mappedIpv4 ? mappedIpv4[1] : normalized
}

function parseIpv4Octets(address: string) {
  if (net.isIP(address) !== 4) return undefined
  const octets = address.split('.').map((part) => Number.parseInt(part, 10))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined
  }
  return octets
}

export function isPrivateIpAddress(address: string) {
  const normalized = normalizeIpAddress(address)
  const ipv4 = parseIpv4Octets(normalized)

  if (ipv4) {
    const [first, second] = ipv4
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    )
  }

  if (net.isIP(normalized) !== 6) return false
  if (normalized === '::' || normalized === '::1') return true
  if (/^f[c-d][0-9a-f]{2}:/i.test(normalized)) return true
  if (/^fe[89ab][0-9a-f]:/i.test(normalized)) return true
  if (normalized.startsWith('ff')) return true

  return false
}

function assertSafeFetchUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported protocol: ${url.protocol}`)
  }

  if (!url.hostname) {
    throw new Error(`Invalid URL hostname: ${url.toString()}`)
  }

  if (isBlockedHostname(url.hostname)) {
    throw new Error(`Blocked hostname: ${url.hostname}`)
  }

  if (net.isIP(url.hostname) && isPrivateIpAddress(url.hostname)) {
    throw new Error(`Blocked private network address: ${url.hostname}`)
  }
}

async function resolvePublicAddress(hostname: string) {
  const normalized = normalizeHostname(hostname)

  if (isBlockedHostname(normalized)) {
    throw new Error(`Blocked hostname: ${hostname}`)
  }

  if (net.isIP(normalized)) {
    if (isPrivateIpAddress(normalized)) {
      throw new Error(`Blocked private network address: ${hostname}`)
    }
    return {
      address: normalizeIpAddress(normalized),
      family: net.isIP(normalized) as 4 | 6,
      all: [{ address: normalizeIpAddress(normalized), family: net.isIP(normalized) as 4 | 6 }],
    }
  }

  const resolved = await dns.lookup(normalized, { all: true, verbatim: true })
  if (!resolved.length) {
    throw new Error(`Hostname did not resolve: ${hostname}`)
  }

  const all = resolved.map((entry) => ({
    address: normalizeIpAddress(entry.address),
    family: entry.family as 4 | 6,
  }))

  for (const entry of all) {
    if (isPrivateIpAddress(entry.address)) {
      throw new Error(`Blocked private network address for ${hostname}: ${entry.address}`)
    }
  }

  return {
    address: all[0]!.address,
    family: all[0]!.family,
    all,
  }
}

function createSafeLookup() {
  return (hostname: string, options: any, callback: any) => {
    resolvePublicAddress(hostname)
      .then((resolved) => {
        if (options?.all) callback(null, resolved.all)
        else callback(null, resolved.address, resolved.family)
      })
      .catch((error) => callback(error))
  }
}

async function requestWithDnsGuard(
  url: URL,
  signal: AbortSignal,
  userAgent: string,
): Promise<GuardedFetchResponse> {
  assertSafeFetchUrl(url)

  const client = url.protocol === 'https:' ? https : http
  const acceptHeader =
    'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,image/*;q=0.9,*/*;q=0.8'

  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers: {
          'User-Agent': userAgent,
          Accept: acceptHeader,
        },
        lookup: createSafeLookup(),
        signal,
      },
      (response) => {
        const chunks: Buffer[] = []

        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on('error', reject)
        response.on('end', () => {
          const headers = new Headers()
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) headers.set(key, value.join(', '))
            else if (value !== undefined) headers.set(key, String(value))
          }

          const status = response.statusCode ?? 0
          resolve({
            url: url.toString(),
            status,
            statusText: response.statusMessage ?? '',
            headers,
            ok: status >= 200 && status < 300,
            bodyBuffer: Buffer.concat(chunks),
          })
        })
      },
    )

    request.on('error', reject)
    request.end()
  })
}

function isRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status)
}

export async function fetchWithRedirects(
  initialUrl: URL,
  signal: AbortSignal,
  userAgent: string,
  requester: GuardedRequester = requestWithDnsGuard,
): Promise<GuardedFetchResponse> {
  let currentUrl = new URL(initialUrl.toString())

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await requester(currentUrl, signal, userAgent)
    if (!isRedirectStatus(response.status)) return response

    const location = response.headers.get('location')
    if (!location) return response
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error(`Too many redirects while fetching ${initialUrl.toString()}`)
    }

    currentUrl = new URL(location, currentUrl)
    assertSafeFetchUrl(currentUrl)
  }

  throw new Error(`Too many redirects while fetching ${initialUrl.toString()}`)
}

function isCloudflareChallenge(response: GuardedFetchResponse) {
  const server = (response.headers.get('server') || '').toLowerCase()
  return (
    response.status === 403 &&
    (response.headers.get('cf-mitigated') === 'challenge' ||
      server.includes('cloudflare'))
  )
}

export async function fetchWithOptionalCloudflareRetry(
  url: URL,
  signal: AbortSignal,
  onUpdate?: (update: { content: Array<{ type: 'text'; text: string }> }) => void,
  requester: GuardedRequester = requestWithDnsGuard,
) {
  let response = await fetchWithRedirects(url, signal, FETCH_USER_AGENT, requester)
  let cloudflareBypassed = false

  if (isCloudflareChallenge(response)) {
    cloudflareBypassed = true
    onUpdate?.({
      content: [
        {
          type: 'text',
          text: 'Cloudflare challenge detected, retrying with fallback User-Agent...',
        },
      ],
    })
    response = await fetchWithRedirects(url, signal, FETCH_USER_AGENT_FALLBACK, requester)
  }

  return { response, cloudflareBypassed }
}

export function parseContentLength(contentLengthHeader: string | null) {
  if (!contentLengthHeader) return undefined
  const parsed = Number.parseInt(contentLengthHeader, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export function shouldApplyHtmlGuard(
  mimeType: string,
  format: string,
  contentLength?: number,
) {
  const isHtml =
    mimeType === 'text/html' || mimeType === 'application/xhtml+xml'
  if (!isHtml) return false
  if (!['markdown', 'text', 'html'].includes(format)) return false
  return contentLength !== undefined && contentLength > MAX_HTML_BYTES
}

function emitFetchProgress(
  onUpdate: ((update: { content: Array<{ type: 'text'; text: string }> }) => void) | undefined,
  stage: string,
  message: string,
) {
  onUpdate?.({
    content: [{ type: 'text', text: `[${stage}] ${message}` }],
  })
}

export function registerWebFetchTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'web_fetch',
    label: 'Web Fetch',
    description:
      'Fetch content from a URL and convert it to markdown, text, html, json, or image. Supports selector-based extraction.',
    promptSnippet:
      'Fetch a web page, image, or API endpoint and extract readable markdown, text, html, json, or image output',
    promptGuidelines: [
      'Use markdown for readable article content, text for plain extraction, html for raw markup, json for APIs, and image for direct image responses.',
      'Use the selector parameter when the user wants a specific part of the page, such as article or #content.',
      `Very large HTML responses over ${formatSize(MAX_HTML_BYTES)} are rejected to avoid expensive parsing.`,
    ],
    parameters: Type.Object({
      url: Type.String({ description: 'URL to fetch' }),
      format: Type.Optional(
        StringEnum(['markdown', 'text', 'html', 'json', 'image'] as const, {
          description:
            'Output format. Defaults to markdown, or image when the response is an image.',
        }),
      ),
      selector: Type.Optional(
        Type.String({
          description:
            'Optional CSS selector to extract a specific part of the page',
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
            'Optional hard cap for text output characters before normal truncation is applied.',
        }),
      ),
      refresh: Type.Optional(
        Type.Boolean({
          description: 'Bypass cached fetch results and force a fresh network request.',
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      const url = params.url.trim()
      const requestedFormat = params.format
      const selector = params.selector?.trim() || undefined
      const timeoutMs = params.timeout ?? DEFAULT_TIMEOUT
      const maxChars = params.maxChars
      const refresh = params.refresh ?? false

      if (!url) throw new Error('URL cannot be empty')
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`Invalid timeout: ${timeoutMs}`)
      }
      if (
        maxChars !== undefined &&
        (!Number.isInteger(maxChars) || maxChars <= 0)
      ) {
        throw new Error(`Invalid maxChars: ${maxChars}`)
      }

      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        throw new Error(`Invalid URL: ${url}`)
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`)
      }

      const cacheKey = buildCacheKey({
        tool: 'web_fetch',
        url,
        format: requestedFormat ?? '(auto)',
        selector,
        maxChars,
      })

      if (!refresh) {
        const cached = getCachedValue<{ content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; details: FetchDetails }>(cacheKey)
        if (cached) {
          emitFetchProgress(onUpdate, 'cache', `Using cached fetch result for ${url}`)
          return {
            content: cached.value.content,
            details: {
              ...cached.value.details,
              cached: true,
              cacheAgeMs: cached.ageMs,
            } satisfies FetchDetails,
          }
        }
      }

      emitFetchProgress(onUpdate, 'resolve', `Validating and fetching ${url}...`)

      const { controller, wasTimedOut, cleanup } = createAbortController(timeoutMs, signal)

      try {
        emitFetchProgress(onUpdate, 'network', `Requesting ${parsedUrl.hostname}...`)

        const {
          response,
          cloudflareBypassed,
        } = await fetchWithOptionalCloudflareRetry(
          parsedUrl,
          controller.signal,
          onUpdate,
        )

        emitFetchProgress(
          onUpdate,
          'response',
          `Received ${response.status} ${response.statusText || ''}`.trim(),
        )

        if (!response.ok) {
          throw new Error(
            `Fetch failed: ${response.status} ${response.statusText}`,
          )
        }

        const finalUrl = response.url || parsedUrl.toString()
        const status = response.status
        const statusText = response.statusText
        const contentType = (
          response.headers.get('content-type') || ''
        ).toLowerCase()
        const contentLength = parseContentLength(
          response.headers.get('content-length'),
        )
        const mimeType = contentType.split(';')[0]?.trim() || ''
        const isHtml =
          mimeType === 'text/html' || mimeType === 'application/xhtml+xml'
        const isJson = mimeType.includes('json')
        const isText = isHtml || mimeType.startsWith('text/') || !mimeType
        const isImage =
          mimeType.startsWith('image/') && mimeType !== 'image/svg+xml'
        const format =
          requestedFormat ?? (isImage ? DEFAULT_IMAGE_FORMAT : 'markdown')

        if (
          contentLength !== undefined &&
          contentLength > LARGE_RESPONSE_WARNING_BYTES
        ) {
          onUpdate?.({
            content: [
              {
                type: 'text',
                text: `Large response detected (${formatSize(contentLength)}).`,
              },
            ],
          })
        }

        if (shouldApplyHtmlGuard(mimeType, format, contentLength)) {
          throw new Error(
            `HTML response too large to process safely: ${formatSize(contentLength!)} (max ${formatSize(MAX_HTML_BYTES)})`,
          )
        }

        const bodyBuffer = response.bodyBuffer
        const bodySize = bodyBuffer.byteLength

        emitFetchProgress(
          onUpdate,
          'download',
          `Downloaded ${formatSize(bodySize)} from ${new URL(finalUrl).hostname}`,
        )

        if (isHtml && ['markdown', 'text', 'html'].includes(format) && bodySize > MAX_HTML_BYTES) {
          throw new Error(
            `HTML response too large to process safely: ${formatSize(bodySize)} (max ${formatSize(MAX_HTML_BYTES)})`,
          )
        }

        if (isImage || format === 'image') {
          if (!isImage) {
            throw new Error(
              `Requested image output but received non-image content type: ${mimeType || 'unknown'}`,
            )
          }

          const summary = `Image fetched successfully: ${finalUrl} (${mimeType}, ${formatSize(bodySize)})`
          const result = {
            content: [
              { type: 'text', text: summary },
              { type: 'image', data: bodyBuffer.toString('base64'), mimeType },
            ],
            details: {
              url: finalUrl,
              format,
              title: null,
              truncated: false,
              tempFile: undefined,
              isImage: true,
              imageMimeType: mimeType,
              imageSize: bodySize,
              status,
              statusText,
              contentType,
              contentLength,
              cloudflareBypassed,
              cached: false,
              cacheAgeMs: 0,
            } satisfies FetchDetails,
          }
          setCachedValue(cacheKey, result, FETCH_CACHE_TTL_MS)
          return result
        }

        const raw = new TextDecoder().decode(bodyBuffer)
        let article: ArticleData | undefined
        let content = raw

        emitFetchProgress(onUpdate, 'process', `Processing ${format} output...`)

        if (format === 'json') {
          if (selector) {
            throw new Error('Selector is not supported for json output')
          }
          try {
            content = JSON.stringify(JSON.parse(raw), null, 2)
          } catch {
            throw new Error(`Failed to parse response as JSON: ${finalUrl}`)
          }
        } else if (format === 'html') {
          if (selector) {
            const selection = selectFragment(raw, selector)
            content = selection.html
            article = {
              title: null,
              byline: null,
              excerpt: null,
              siteName: null,
              contentHtml: selection.html,
              textContent: selection.text,
              extractionMethod: 'selector',
              selectedSelector: selector,
            }
          }
        } else if (format === 'text') {
          if (isHtml) {
            emitFetchProgress(onUpdate, 'extract', selector ? `Selecting ${selector}...` : 'Extracting main text...')
            article = extractBestHtmlContent(raw, finalUrl, selector)
            content = article.textContent
          } else if (isText || isJson) {
            content = normalizeWhitespace(raw)
          } else {
            throw new Error(
              `Unsupported content type for text output: ${contentType || 'unknown'}`,
            )
          }
        } else if (format === 'markdown') {
          if (isHtml) {
            emitFetchProgress(onUpdate, 'extract', selector ? `Selecting ${selector}...` : 'Extracting readable article...')
            article = extractBestHtmlContent(raw, finalUrl, selector)
            emitFetchProgress(onUpdate, 'convert', 'Converting HTML to markdown...')
            content = createTurndownService().turndown(article.contentHtml)
            content = cleanupMarkdown(content)
          } else if (isText || isJson) {
            content = raw.trim()
          } else {
            throw new Error(
              `Unsupported content type for markdown output: ${contentType || 'unknown'}`,
            )
          }
        } else {
          throw new Error(`Unsupported format: ${format}`)
        }

        const output = truncateForModel(
          content,
          extensionForFormat(format),
          maxChars,
        )
        const messageParts: string[] = []
        if (article?.title && format !== 'json' && format !== 'html') {
          messageParts.push(`# ${article.title}`)
        }
        if (article?.byline && format !== 'json' && format !== 'html') {
          messageParts.push(`By: ${article.byline}`)
        }
        if (article?.siteName && format !== 'json' && format !== 'html') {
          messageParts.push(`Site: ${article.siteName}`)
        }
        if (article?.excerpt && format === 'markdown') {
          messageParts.push(`> ${article.excerpt}`)
        }
        if (messageParts.length > 0) {
          messageParts.push('')
        }
        messageParts.push(output.text)

        const result = {
          content: [{ type: 'text', text: messageParts.join('\n') }],
          details: {
            url: finalUrl,
            format,
            title: article?.title,
            byline: article?.byline,
            siteName: article?.siteName,
            excerpt: article?.excerpt,
            selectedSelector: article?.selectedSelector,
            extractionMethod: article?.extractionMethod,
            truncated: output.truncated,
            tempFile: output.tempFile,
            status,
            statusText,
            contentType,
            contentLength: contentLength ?? bodySize,
            charLimited: output.charLimited,
            maxChars: output.maxChars,
            originalChars: output.originalChars,
            cloudflareBypassed,
            cached: false,
            cacheAgeMs: 0,
          } satisfies FetchDetails,
        }
        setCachedValue(cacheKey, result, FETCH_CACHE_TTL_MS)
        return result
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          if (wasTimedOut()) {
            throw new Error(`Fetch request timed out after ${timeoutMs}ms`)
          }
          throw new Error('Fetch request aborted')
        }
        throw error
      } finally {
        cleanup()
      }
    },
    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('web_fetch '))
      text += theme.fg('accent', truncateText(args.url, 84))
      const parts: string[] = []
      if (args.format) parts.push(`format=${args.format}`)
      if (args.selector) parts.push(`selector=${args.selector}`)
      if (args.maxChars) parts.push(`maxChars=${args.maxChars}`)
      if (args.timeout) parts.push(`timeout=${args.timeout}ms`)
      if (args.refresh) parts.push('refresh=true')
      if (parts.length) text += theme.fg('dim', ` (${parts.join(', ')})`)
      return new Text(text, 0, 0)
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg('warning', 'Fetching...'), 0, 0)

      const details = (result.details || {}) as FetchDetails
      let text = ''

      if (details.isImage) {
        text += theme.fg(
          'success',
          `Image ${details.imageMimeType || ''}`.trim(),
        )
        if (details.imageSize) {
          text += theme.fg('dim', ` (${formatSize(details.imageSize)})`)
        }
      } else {
        text += theme.fg('success', details.format || 'fetched')
        if (details.title) {
          text += ` ${theme.fg('accent', truncateText(details.title, 80))}`
        }
      }

      text += renderBadges(theme, {
        truncated: details.truncated,
        charLimited: details.charLimited,
        selector: details.selectedSelector,
        extractionMethod: details.extractionMethod,
        cloudflareBypassed: details.cloudflareBypassed,
        cached: details.cached,
      })

      if (expanded) {
        text += `\n${theme.fg('dim', `URL: ${details.url || 'unknown'}`)}`
        if (details.cached && details.cacheAgeMs !== undefined) {
          text += `\n${theme.fg('dim', `Cache age: ${details.cacheAgeMs}ms`)}`
        }
        if (details.status) {
          text += `\n${theme.fg('dim', `HTTP: ${details.status} ${details.statusText || ''}`.trim())}`
        }
        if (details.contentType) {
          text += `\n${theme.fg('dim', `Content-Type: ${details.contentType}`)}`
        }
        if (details.contentLength !== undefined) {
          text += `\n${theme.fg('dim', `Content-Length: ${formatSize(details.contentLength)}`)}`
        }
        if (details.title)
          text += `\n${theme.fg('accent', `Title: ${details.title}`)}`
        if (details.byline)
          text += `\n${theme.fg('muted', `Byline: ${details.byline}`)}`
        if (details.siteName)
          text += `\n${theme.fg('muted', `Site: ${details.siteName}`)}`
        if (details.extractionMethod)
          text += `\n${theme.fg('muted', `Extraction: ${details.extractionMethod}`)}`
        if (details.tempFile)
          text += `\n${theme.fg('muted', `Full output: ${details.tempFile}`)}`
      }

      return new Text(text, 0, 0)
    },
  })
}
