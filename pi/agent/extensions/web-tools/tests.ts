import assert from 'node:assert/strict'
import {
  SEARCH_PROVIDER_NAMES,
  dedupeResults,
  parseBraveResults,
  parseDuckDuckGoResults,
  parseGoogleResults,
  parseKagiResults,
  parseSearXngResults,
  unwrapDuckDuckGoUrl,
} from './web-search.ts'
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
testFetchGuardHelpers()
console.log('tests ok')
