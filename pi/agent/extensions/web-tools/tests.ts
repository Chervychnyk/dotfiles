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
import { resolveSearchProvider } from './providers/index.ts'
import { SEARCH_PROVIDER_NAMES } from './providers/types.ts'
import { parseContentLength, shouldApplyHtmlGuard } from './web-fetch.ts'

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
          { title: 'Brave Result', url: 'https://brave.test', description: 'desc' },
        ],
      },
    },
    5,
  )
  assert.equal(brave[0]?.title, 'Brave Result')

  const kagi = parseKagiResults(
    {
      data: [{ title: 'Kagi Result', url: 'https://kagi.test', snippet: 'desc' }],
    },
    5,
  )
  assert.equal(kagi[0]?.url, 'https://kagi.test')

  const google = parseGoogleResults(
    {
      items: [{ title: 'Google Result', link: 'https://google.test', snippet: 'desc' }],
    },
    5,
  )
  assert.equal(google[0]?.url, 'https://google.test')

  const searxng = parseSearXngResults(
    {
      results: [{ title: 'SearXNG Result', url: 'https://searx.test', content: 'desc' }],
    },
    5,
  )
  assert.equal(searxng[0]?.snippet, 'desc')
}

function testProviderResolution() {
  assert.equal(resolveSearchProvider('duckduckgo', {}).name, 'duckduckgo')
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
    resolveSearchProvider(undefined, { SEARXNG_URL: 'https://searx.test' }).name,
    'searxng',
  )
  assert.throws(() => resolveSearchProvider('nope' as never, {}), /Unknown search provider/)
}

function testFetchGuardHelpers() {
  assert.equal(parseContentLength(null), undefined)
  assert.equal(parseContentLength('1234'), 1234)
  assert.equal(parseContentLength('abc'), undefined)

  assert.equal(shouldApplyHtmlGuard('text/html', 'markdown', 6 * 1024 * 1024), true)
  assert.equal(shouldApplyHtmlGuard('text/html', 'json', 6 * 1024 * 1024), false)
  assert.equal(shouldApplyHtmlGuard('application/json', 'markdown', 6 * 1024 * 1024), false)
  assert.equal(shouldApplyHtmlGuard('text/html', 'markdown', 1024), false)
}

testSearchHelpers()
testProviderResolution()
testFetchGuardHelpers()
console.log('tests ok')
