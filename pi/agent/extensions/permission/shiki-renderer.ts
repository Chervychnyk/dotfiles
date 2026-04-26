import * as path from 'node:path'

import { createTwoFilesPatch, diffWords, structuredPatch } from 'diff'
import { codeToTokens } from 'shiki'

import {
  DEFAULT_DIFF_RENDERER,
  DEFAULT_SHIKI_THEME,
  type DiffPreviewLayout,
  type DiffPreviewOptions,
} from './preview-types.ts'
import { clipRenderedLines, isDiffInputTooLarge } from './preview-text.ts'

export async function previewWithShiki(
  targetPath: string,
  oldText: string,
  newText: string,
  maxLines: number,
  options: DiffPreviewOptions,
  layout: DiffPreviewLayout = 'inline',
  renderWidth?: number,
): Promise<string | undefined> {
  if ((options.diffRenderer ?? DEFAULT_DIFF_RENDERER) !== 'shiki') return undefined
  if (isDiffInputTooLarge(oldText, newText)) return undefined

  try {
    const theme = options.shikiTheme ?? DEFAULT_SHIKI_THEME
    if (layout === 'side-by-side') {
      const rendered = await renderShikiSideBySide(targetPath, oldText, newText, theme, renderWidth)
      return rendered ? clipRenderedLines(rendered, maxLines) : undefined
    }

    const diff = createTwoFilesPatch(`${targetPath}.before`, `${targetPath}.after`, oldText, newText, '', '', { context: 3 })
    if (!diff.trim()) return undefined
    const rendered = await codeToAnsi(diff, 'diff', theme)
    return clipRenderedLines(rendered, maxLines)
  } catch {
    return undefined
  }
}

type DiffLine = {
  type: 'ctx' | 'add' | 'del' | 'sep'
  oldNum: number | null
  newNum: number | null
  content: string
}

type SplitRow = { left: DiffLine | null; right: DiffLine | null }

type HighlightedRow = {
  gutter: string
  continuationGutter: string
  bodyRows: string[]
}

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const BG_ADD = '\x1b[48;2;18;45;28m'
const BG_DEL = '\x1b[48;2;55;24;24m'
const BG_ADD_WORD = '\x1b[48;2;35;75;50m'
const BG_DEL_WORD = '\x1b[48;2;80;35;35m'
const FG_ADD = '\x1b[38;2;133;232;157m'
const FG_DEL = '\x1b[38;2;253;174;183m'
const FG_DIM = '\x1b[38;2;110;118;129m'
const FG_RULE = '\x1b[38;2;80;80;80m'
const WORD_DIFF_MIN_SIMILARITY = 0.15
const MAX_WRAP_ROWS = 3

async function renderShikiSideBySide(
  targetPath: string,
  oldText: string,
  newText: string,
  theme: string,
  renderWidth?: number,
): Promise<string | undefined> {
  const width = typeof renderWidth === 'number' && Number.isFinite(renderWidth)
    ? Math.max(80, Math.floor(renderWidth))
    : 140
  const leftWidth = Math.floor((width - 1) / 2)
  const rightWidth = width - leftWidth - 1
  if (leftWidth < 30 || rightWidth < 30) return undefined

  const lines = parseStructuredDiff(oldText, newText)
  if (lines.length === 0) return undefined

  const rows = buildSplitRows(lines)
  const numberWidth = Math.max(2, String(Math.max(...lines.map((line) => line.oldNum ?? line.newNum ?? 0), 0)).length)
  const gutterWidth = numberWidth + 3
  const leftCodeWidth = Math.max(12, leftWidth - gutterWidth)
  const rightCodeWidth = Math.max(12, rightWidth - gutterWidth)
  const language = languageForPath(targetPath)

  const leftSource: string[] = []
  const rightSource: string[] = []
  for (const row of rows) {
    if (row.left && row.left.type !== 'sep') leftSource.push(row.left.content)
    if (row.right && row.right.type !== 'sep') rightSource.push(row.right.content)
  }

  const [leftHighlighted, rightHighlighted] = await Promise.all([
    codeLinesToAnsi(leftSource.join('\n'), language, theme),
    codeLinesToAnsi(rightSource.join('\n'), language, theme),
  ])

  let leftIndex = 0
  let rightIndex = 0
  const out: string[] = []
  out.push(`${FG_DEL}${'old'.padEnd(leftWidth)}${RESET}${FG_RULE}┊${RESET}${FG_ADD}${'new'.padEnd(rightWidth)}${RESET}`)
  out.push(`${FG_RULE}${'─'.repeat(leftWidth)}┊${'─'.repeat(rightWidth)}${RESET}`)

  for (const row of rows) {
    if (row.left?.type === 'sep' || row.right?.type === 'sep') {
      const label = '···'
      out.push(`${FG_DIM}${fitAnsi(label, leftWidth)}${RESET}${FG_RULE}┊${RESET}${FG_DIM}${fitAnsi(label, rightWidth)}${RESET}`)
      continue
    }

    const paired = row.left?.type === 'del' && row.right?.type === 'add'
    const analysis = paired ? wordDiffAnalysis(row.left?.content ?? '', row.right?.content ?? '') : undefined
    const useWordHighlights = !!analysis && analysis.similarity >= WORD_DIFF_MIN_SIMILARITY

    const leftContent = row.left ? leftHighlighted[leftIndex++] ?? row.left.content : ''
    const rightContent = row.right ? rightHighlighted[rightIndex++] ?? row.right.content : ''
    const left = renderSplitHalf(
      row.left,
      leftContent,
      numberWidth,
      leftCodeWidth,
      useWordHighlights ? analysis?.oldRanges : undefined,
    )
    const right = renderSplitHalf(
      row.right,
      rightContent,
      numberWidth,
      rightCodeWidth,
      useWordHighlights ? analysis?.newRanges : undefined,
    )

    const rowCount = Math.max(left.bodyRows.length, right.bodyRows.length)
    for (let i = 0; i < rowCount; i++) {
      out.push([
        i === 0 ? left.gutter : left.continuationGutter,
        left.bodyRows[i] ?? fitAnsi('', leftCodeWidth),
        `${FG_RULE}┊${RESET}`,
        i === 0 ? right.gutter : right.continuationGutter,
        right.bodyRows[i] ?? fitAnsi('', rightCodeWidth),
      ].join(''))
    }
  }

  out.push(`${FG_RULE}${'─'.repeat(leftWidth)}┊${'─'.repeat(rightWidth)}${RESET}`)
  return out.join('\n')
}

function parseStructuredDiff(oldText: string, newText: string): DiffLine[] {
  const patch = structuredPatch('', '', oldText, newText, '', '', { context: 3 })
  const lines: DiffLine[] = []

  for (let hunkIndex = 0; hunkIndex < patch.hunks.length; hunkIndex++) {
    if (hunkIndex > 0) lines.push({ type: 'sep', oldNum: null, newNum: null, content: '' })

    const hunk = patch.hunks[hunkIndex]
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    for (const raw of hunk.lines) {
      if (raw === '\\ No newline at end of file') continue
      const marker = raw[0]
      const content = raw.slice(1)
      if (marker === '-') {
        lines.push({ type: 'del', oldNum: oldLine++, newNum: null, content })
      } else if (marker === '+') {
        lines.push({ type: 'add', oldNum: null, newNum: newLine++, content })
      } else {
        lines.push({ type: 'ctx', oldNum: oldLine++, newNum: newLine++, content })
      }
    }
  }

  return lines
}

function buildSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (line.type === 'ctx' || line.type === 'sep') {
      rows.push({ left: line, right: line })
      index++
      continue
    }

    const deleted: DiffLine[] = []
    while (lines[index]?.type === 'del') deleted.push(lines[index++])
    const added: DiffLine[] = []
    while (lines[index]?.type === 'add') added.push(lines[index++])

    const count = Math.max(deleted.length, added.length)
    for (let i = 0; i < count; i++) {
      rows.push({ left: deleted[i] ?? null, right: added[i] ?? null })
    }
  }

  return rows
}

function renderSplitHalf(
  line: DiffLine | null,
  highlightedContent: string,
  numberWidth: number,
  codeWidth: number,
  wordRanges?: Array<[number, number]>,
): HighlightedRow {
  if (!line) {
    const gutter = `${FG_DIM}${fitAnsi(' '.repeat(numberWidth + 1), numberWidth + 1)}│ ${RESET}`
    return { gutter, continuationGutter: gutter, bodyRows: [fitAnsi('', codeWidth)] }
  }

  const sign = line.type === 'del' ? '-' : line.type === 'add' ? '+' : ' '
  const number = line.type === 'del' ? line.oldNum : line.type === 'add' ? line.newNum : line.oldNum
  const fg = line.type === 'del' ? FG_DEL : line.type === 'add' ? FG_ADD : FG_DIM
  const bg = line.type === 'del' ? BG_DEL : line.type === 'add' ? BG_ADD : ''
  const wordBg = line.type === 'del' ? BG_DEL_WORD : BG_ADD_WORD
  const gutter = `${fg}${String(number ?? '').padStart(numberWidth, ' ')}${sign}${RESET}│ `
  const continuationGutter = `${fg}${' '.repeat(numberWidth + 1)}${RESET}│ `
  const body = wordRanges?.length
    ? injectBg(highlightedContent, wordRanges, bg, wordBg)
    : `${bg}${line.type === 'ctx' ? DIM : ''}${highlightedContent}${RESET}`

  return {
    gutter,
    continuationGutter,
    bodyRows: wrapAnsi(body, codeWidth, MAX_WRAP_ROWS, bg),
  }
}

function wordDiffAnalysis(
  oldText: string,
  newText: string,
): { similarity: number; oldRanges: Array<[number, number]>; newRanges: Array<[number, number]> } {
  const parts = diffWords(oldText, newText)
  const oldRanges: Array<[number, number]> = []
  const newRanges: Array<[number, number]> = []
  let oldPosition = 0
  let newPosition = 0
  let same = 0

  for (const part of parts) {
    if (part.removed) {
      oldRanges.push([oldPosition, oldPosition + part.value.length])
      oldPosition += part.value.length
    } else if (part.added) {
      newRanges.push([newPosition, newPosition + part.value.length])
      newPosition += part.value.length
    } else {
      same += part.value.length
      oldPosition += part.value.length
      newPosition += part.value.length
    }
  }

  const maxLength = Math.max(oldText.length, newText.length)
  return { similarity: maxLength > 0 ? same / maxLength : 1, oldRanges, newRanges }
}

function injectBg(ansiLine: string, ranges: Array<[number, number]>, baseBg: string, highlightBg: string): string {
  if (!ranges.length) return `${baseBg}${ansiLine}${RESET}`

  let out = baseBg
  let visible = 0
  let highlighted = false
  let rangeIndex = 0
  let index = 0

  while (index < ansiLine.length) {
    if (ansiLine[index] === '\x1b') {
      const end = ansiLine.indexOf('m', index)
      if (end !== -1) {
        const sequence = ansiLine.slice(index, end + 1)
        out += sequence
        if (sequence === RESET) out += highlighted ? highlightBg : baseBg
        index = end + 1
        continue
      }
    }

    while (rangeIndex < ranges.length && visible >= ranges[rangeIndex][1]) rangeIndex++
    const shouldHighlight = rangeIndex < ranges.length &&
      visible >= ranges[rangeIndex][0] &&
      visible < ranges[rangeIndex][1]
    if (shouldHighlight !== highlighted) {
      highlighted = shouldHighlight
      out += highlighted ? highlightBg : baseBg
    }
    out += ansiLine[index]
    visible++
    index++
  }

  return `${out}${RESET}`
}

async function codeLinesToAnsi(code: string, language: string, theme: string): Promise<string[]> {
  if (!code) return []
  const result = await codeToTokens(code, { lang: language, theme })
  return result.tokens.map((line) => line.map((token) => `${tokenToAnsi(token)}${token.content}${RESET}`).join(''))
}

async function codeToAnsi(code: string, lang: string, theme: string): Promise<string> {
  const result = await codeToTokens(code, { lang, theme })
  return result.tokens
    .map((line) => line.map((token) => `${tokenToAnsi(token)}${token.content}${RESET}`).join(''))
    .join('\n')
}

function tokenToAnsi(token: { color?: string; fontStyle?: number }): string {
  const color = token.color && hexToRgb(token.color)
  const fg = color ? `\x1b[38;2;${color.r};${color.g};${color.b}m` : ''
  const bold = typeof token.fontStyle === 'number' && (token.fontStyle & 2) ? BOLD : ''
  const italic = typeof token.fontStyle === 'number' && (token.fontStyle & 1) ? '\x1b[3m' : ''
  const underline = typeof token.fontStyle === 'number' && (token.fontStyle & 4) ? '\x1b[4m' : ''
  return `${fg}${bold}${italic}${underline}`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | undefined {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function languageForPath(targetPath: string): string {
  const ext = path.extname(targetPath).slice(1).toLowerCase()
  return ({
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    swift: 'swift',
    kt: 'kotlin',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    lua: 'lua',
    php: 'php',
    dart: 'dart',
    xml: 'xml',
  } as Record<string, string>)[ext] ?? 'text'
}

function wrapAnsi(value: string, width: number, maxRows: number, fillBg = ''): string[] {
  const rows: string[] = []
  let current = ''
  let visible = 0
  let index = 0

  while (index < value.length) {
    if (value[index] === '\x1b') {
      const end = value.indexOf('m', index)
      if (end !== -1) {
        current += value.slice(index, end + 1)
        index = end + 1
        continue
      }
    }

    if (visible >= width) {
      rows.push(`${fitAnsi(current, width)}${RESET}`)
      current = fillBg
      visible = 0
      if (rows.length >= maxRows) break
    }

    current += value[index]
    visible++
    index++
  }

  if (rows.length < maxRows) rows.push(`${fitAnsi(current, width)}${RESET}`)
  if (index < value.length && rows.length > 0) {
    rows[rows.length - 1] = `${fitAnsi(rows[rows.length - 1].replace(/\x1b\[[0-9;]*m/g, ''), Math.max(0, width - 1))}…${RESET}`
  }
  return rows.length > 0 ? rows : [fitAnsi('', width)]
}

function fitAnsi(value: string, width: number): string {
  let out = ''
  let visible = 0
  let index = 0

  while (index < value.length && visible < width) {
    if (value[index] === '\x1b') {
      const end = value.indexOf('m', index)
      if (end !== -1) {
        out += value.slice(index, end + 1)
        index = end + 1
        continue
      }
    }

    out += value[index]
    visible++
    index++
  }

  return out + ' '.repeat(Math.max(0, width - visible))
}
