import assert from 'node:assert/strict'
import { parseBraveResults } from './providers/brave.ts'
import {
  parseDuckDuckGoResults,
  unwrapDuckDuckGoUrl,
} from './providers/duckduckgo.ts'
import { parseGoogleResults } from './providers/google.ts'
import { parseKagiResults } from './providers/kagi.ts'
import {
  MAX_SEARCH_LIMIT,
  clampSearchLimit,
  dedupeResults,
} from './providers/shared.ts'
import { parseSearXngResults } from './providers/searxng.ts'
import { resolveSearchProvider, resolveSearchProviders } from './providers/index.ts'
import { SEARCH_PROVIDER_NAMES } from './providers/types.ts'
import {
  fetchWithOptionalCloudflareRetry,
  fetchWithRedirects,
  isBlockedHostname,
  isPrivateIpAddress,
  parseContentLength,
  shouldApplyHtmlGuard,
  type GuardedFetchResponse,
  type GuardedRequester,
} from './web-fetch.ts'
import {
  buildCacheKey,
  getCachedValue,
  setCachedValue,
} from './shared.ts'

function testSearchHelpers() {
  assert.deepEqual(SEARCH_PROVIDER_NAMES, [
    'auto',
    'duckduckgo',
    'brave',
    'kagi',
    'google',
    'searxng',
  ])
  assert.equal(MAX_SEARCH_LIMIT, 20)
  assert.equal(clampSearchLimit(0), 1)
  assert.equal(clampSearchLimit(5), 5)
  assert.equal(clampSearchLimit(999), 20)

  assert.equal(
    unwrapDuckDuckGoUrl(
      '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1',
    ),
    'https://example.com/a?b=1',
  )

  const deduped = dedupeResults(
    [
      { title: ' One ', url: 'https://a.test', snippet: ' Alpha ' },
      { title: 'One', url: 'https://a.test', snippet: 'Alpha' },
      { title: 'Two', url: 'https://b.test', snippet: 'Beta' },
    ],
    10,
  )
  assert.equal(deduped.length, 2)
  assert.equal(deduped[0]?.title, 'One')
  assert.equal(deduped[0]?.snippet, 'Alpha')

  const ddgHtml = `
    <div class="result">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs">Example Docs</a>
      <div class="result__snippet"> Useful docs </div>
    </div>
  `
  const ddg = parseDuckDuckGoResults(ddgHtml, 5)
  assert.equal(ddg.length, 1)
  assert.equal(ddg[0]?.url, 'https://example.com/docs')

  const brave = parseBraveResults(
    {
      web: {
        results: [
          {
            title: 'Brave Result',
            url: 'https://brave.test',
            description: 'desc',
          },
        ],
      },
    },
    5,
  )
  assert.equal(brave[0]?.title, 'Brave Result')

  const kagi = parseKagiResults(
    {
      data: [
        { title: 'Kagi Result', url: 'https://kagi.test', snippet: 'desc' },
      ],
    },
    5,
  )
  assert.equal(kagi[0]?.url, 'https://kagi.test')

  const google = parseGoogleResults(
    {
      items: [
        {
          title: 'Google Result',
          link: 'https://google.test',
          snippet: 'desc',
        },
      ],
    },
    5,
  )
  assert.equal(google[0]?.url, 'https://google.test')

  const searxng = parseSearXngResults(
    {
      results: [
        { title: 'SearXNG Result', url: 'https://searx.test', content: 'desc' },
      ],
    },
    5,
  )
  assert.equal(searxng[0]?.snippet, 'desc')
}

function testProviderResolution() {
  assert.equal(resolveSearchProvider('duckduckgo', {}).name, 'duckduckgo')
  assert.deepEqual(
    resolveSearchProviders(undefined, {
      BRAVE_API_KEY: 'x',
      KAGI_API_KEY: 'y',
      SEARXNG_URL: 'https://searx.test',
    }).map((provider) => provider.name),
    ['brave', 'kagi', 'searxng', 'duckduckgo'],
  )
  assert.equal(
    resolveSearchProvider(undefined, { BRAVE_API_KEY: 'x' }).name,
    'brave',
  )
  assert.equal(
    resolveSearchProvider(undefined, { KAGI_API_KEY: 'x' }).name,
    'kagi',
  )
  assert.equal(
    resolveSearchProvider(undefined, {
      GOOGLE_API_KEY: 'x',
      GOOGLE_CX: 'y',
    }).name,
    'google',
  )
  assert.equal(
    resolveSearchProvider(undefined, { SEARXNG_URL: 'https://searx.test' })
      .name,
    'searxng',
  )
  assert.throws(
    () => resolveSearchProvider('nope' as never, {}),
    /Unknown search provider/,
  )
}

function testCacheHelpers() {
  const keyA = buildCacheKey({ b: 2, a: 1, list: ['x', { z: 1, y: 2 }] })
  const keyB = buildCacheKey({ a: 1, list: ['x', { y: 2, z: 1 }], b: 2 })
  assert.equal(keyA, keyB)

  setCachedValue('cache:test', { value: 1 }, 1000, 100)
  assert.deepEqual(getCachedValue<{ value: number }>('cache:test', 150), {
    value: { value: 1 },
    ageMs: 50,
  })
  assert.equal(getCachedValue('cache:test', 1200), undefined)
}

function createHeaders(entries: Record<string, string>) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(entries)) headers.set(key, value)
  return headers
}

function createResponse(
  url: string,
  status: number,
  headers: Record<string, string> = {},
): GuardedFetchResponse {
  return {
    url,
    status,
    statusText: status === 200 ? 'OK' : status === 302 ? 'Found' : status === 403 ? 'Forbidden' : '',
    headers: createHeaders(headers),
    ok: status >= 200 && status < 300,
    bodyBuffer: Buffer.from('test'),
  }
}

async function testMockedFetchFlows() {
  const visited: string[] = []
  const redirectingRequester: GuardedRequester = async (url, _signal, _userAgent) => {
    visited.push(url.toString())
    if (url.pathname === '/start') {
      return createResponse(url.toString(), 302, { location: '/final' })
    }
    return createResponse(url.toString(), 200)
  }

  const redirected = await fetchWithRedirects(
    new URL('https://example.com/start'),
    new AbortController().signal,
    'agent',
    redirectingRequester,
  )
  assert.equal(redirected.url, 'https://example.com/final')
  assert.deepEqual(visited, [
    'https://example.com/start',
    'https://example.com/final',
  ])

  const blockedRedirectRequester: GuardedRequester = async () =>
    createResponse('https://example.com/start', 302, {
      location: 'http://localhost/admin',
    })
  await assert.rejects(
    () =>
      fetchWithRedirects(
        new URL('https://example.com/start'),
        new AbortController().signal,
        'agent',
        blockedRedirectRequester,
      ),
    /Blocked hostname: localhost/,
  )

  const loopingRequester: GuardedRequester = async (url) =>
    createResponse(url.toString(), 302, { location: '/loop' })
  await assert.rejects(
    () =>
      fetchWithRedirects(
        new URL('https://example.com/loop'),
        new AbortController().signal,
        'agent',
        loopingRequester,
      ),
    /Too many redirects/,
  )

  const userAgents: string[] = []
  const updates: string[] = []
  let attempts = 0
  const cloudflareRequester: GuardedRequester = async (url, _signal, userAgent) => {
    attempts += 1
    userAgents.push(userAgent)
    if (attempts === 1) {
      return createResponse(url.toString(), 403, {
        server: 'cloudflare',
        'cf-mitigated': 'challenge',
      })
    }
    return createResponse(url.toString(), 200)
  }

  const retried = await fetchWithOptionalCloudflareRetry(
    new URL('https://example.com/docs'),
    new AbortController().signal,
    (update) => {
      updates.push(update.content.map((item) => item.text).join('\n'))
    },
    cloudflareRequester,
  )
  assert.equal(retried.cloudflareBypassed, true)
  assert.equal(retried.response.status, 200)
  assert.deepEqual(userAgents, ['pi-web-fetch/1.1', 'web_fetch/1.1'])
  assert.ok(
    updates.some((text) => text.includes('Cloudflare challenge detected')),
  )
}

async function testAbortHandling() {
  const controller = new AbortController()
  const abortingRequester: GuardedRequester = async (_url, signal) => {
    await Promise.resolve()
    controller.abort()
    if (signal.aborted) {
      const error = new Error('request aborted')
      error.name = 'AbortError'
      throw error
    }
    return createResponse('https://example.com/never', 200)
  }

  await assert.rejects(
    () =>
      fetchWithRedirects(
        new URL('https://example.com/data'),
        controller.signal,
        'agent',
        abortingRequester,
      ),
    /request aborted/,
  )
}

function testFetchGuardHelpers() {
  assert.equal(parseContentLength(null), undefined)
  assert.equal(parseContentLength('1234'), 1234)
  assert.equal(parseContentLength('abc'), undefined)

  assert.equal(isBlockedHostname('localhost'), true)
  assert.equal(isBlockedHostname('api.localhost'), true)
  assert.equal(isBlockedHostname('example.com'), false)

  assert.equal(isPrivateIpAddress('127.0.0.1'), true)
  assert.equal(isPrivateIpAddress('10.0.0.8'), true)
  assert.equal(isPrivateIpAddress('172.16.5.4'), true)
  assert.equal(isPrivateIpAddress('192.168.1.10'), true)
  assert.equal(isPrivateIpAddress('169.254.169.254'), true)
  assert.equal(isPrivateIpAddress('8.8.8.8'), false)
  assert.equal(isPrivateIpAddress('::1'), true)
  assert.equal(isPrivateIpAddress('fc00::1'), true)
  assert.equal(isPrivateIpAddress('fe80::1'), true)
  assert.equal(isPrivateIpAddress('2606:4700:4700::1111'), false)
  assert.equal(isPrivateIpAddress('::ffff:127.0.0.1'), true)

  assert.equal(
    shouldApplyHtmlGuard('text/html', 'markdown', 6 * 1024 * 1024),
    true,
  )
  assert.equal(
    shouldApplyHtmlGuard('text/html', 'json', 6 * 1024 * 1024),
    false,
  )
  assert.equal(
    shouldApplyHtmlGuard('application/json', 'markdown', 6 * 1024 * 1024),
    false,
  )
  assert.equal(shouldApplyHtmlGuard('text/html', 'markdown', 1024), false)
}

await testMockedFetchFlows()
await testAbortHandling()
testSearchHelpers()
testProviderResolution()
testCacheHelpers()
testFetchGuardHelpers()
console.log('tests ok')
