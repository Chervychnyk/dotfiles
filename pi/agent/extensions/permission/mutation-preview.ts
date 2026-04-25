import * as cp from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export const SIDE_BY_SIDE_MIN_WIDTH = 140
const PREVIEW_MAX_LINES = 5000

type DiffPreviewLayout = 'inline' | 'side-by-side'

export type PreviewRenderer = 'delta' | 'bat' | 'fallback'

interface DiffPreviewSource {
  targetPath: string
  oldText: string
  newText: string
}

export interface MutationPreview {
  renderer: PreviewRenderer
  content: string
  warnings: string[]
  diffSource?: DiffPreviewSource
}

export interface ResolvedPreviewContent {
  content: string
  layout: DiffPreviewLayout
}

interface PlannedEditBlock {
  blockIndex: number
  index: number
  matchLength: number
  newText: string
}

export function getWritePreview(
  targetPath: string,
  input: Record<string, unknown>,
  cwd: string,
): MutationPreview {
  const content = typeof input.content === 'string' ? input.content : ''
  const absolutePath = path.resolve(cwd, targetPath)
  const warnings: string[] = []

  let existingContent: string | undefined
  try {
    existingContent = fs.readFileSync(absolutePath, 'utf8')
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
    if (code !== 'ENOENT') {
      warnings.push(`Could not read existing file at ${targetPath}; showing write content preview only.`)
    }
  }

  if (existingContent !== undefined) {
    if (existingContent === content) {
      return {
        renderer: 'delta',
        content: 'No textual changes.',
        warnings,
      }
    }

    const deltaPreview = previewWithDelta(targetPath, existingContent, content, PREVIEW_MAX_LINES)
    if (deltaPreview) {
      return {
        renderer: 'delta',
        content: deltaPreview,
        warnings,
        diffSource: {
          targetPath,
          oldText: existingContent,
          newText: content,
        },
      }
    }

    warnings.push('Could not render overwrite diff with delta; showing proposed content with bat.')
  }

  const batPreview = previewWithBat(targetPath, content, PREVIEW_MAX_LINES)
  if (batPreview) {
    return { renderer: 'bat', content: batPreview, warnings }
  }

  warnings.push('bat unavailable or failed; using plain text preview.')
  return { renderer: 'fallback', content: previewText(content, PREVIEW_MAX_LINES), warnings }
}

function getCachedDiffPreviewForWidth(
  preview: MutationPreview,
  width: number,
  layout: DiffPreviewLayout,
  cache?: Map<string, string>,
): string | undefined {
  if (!preview.diffSource) return undefined

  const normalizedWidth = Math.max(40, Math.floor(width))
  const key = `${layout}:${normalizedWidth}`
  if (cache?.has(key)) {
    return cache.get(key)
  }

  const rendered = previewWithDelta(
    preview.diffSource.targetPath,
    preview.diffSource.oldText,
    preview.diffSource.newText,
    PREVIEW_MAX_LINES,
    layout,
    normalizedWidth,
  )

  if (rendered && cache) {
    cache.set(key, rendered)
  }

  return rendered
}

export function resolvePreviewContentForWidth(
  preview: MutationPreview,
  width: number,
  cache?: Map<string, string>,
): ResolvedPreviewContent {
  if (preview.renderer !== 'delta') {
    return { content: preview.content, layout: 'inline' }
  }

  if (width >= SIDE_BY_SIDE_MIN_WIDTH) {
    const sideBySide = getCachedDiffPreviewForWidth(preview, width, 'side-by-side', cache)
    if (sideBySide) {
      return { content: sideBySide, layout: 'side-by-side' }
    }
  }

  const inline = getCachedDiffPreviewForWidth(preview, width, 'inline', cache)
  if (inline) {
    return { content: inline, layout: 'inline' }
  }

  return { content: preview.content, layout: 'inline' }
}

export function formatWritePrompt(
  targetPath: string,
  input: Record<string, unknown>,
  preview: MutationPreview,
  resolvedPreview: ResolvedPreviewContent,
): string {
  const content = typeof input.content === 'string' ? input.content : ''
  const lines = countLines(content)
  const bytes = Buffer.byteLength(content, 'utf8')
  const previewLabel = preview.renderer === 'delta'
    ? `Diff preview (${resolvedPreview.layout}):`
    : 'Content preview:'

  return [
    'Allow file write?',
    `Path: ${targetPath}`,
    `Size: ${lines} lines, ${bytes} bytes`,
    ...formatPreviewWarnings(preview.warnings),
    previewLabel,
    resolvedPreview.content,
  ].join('\n')
}

export function getEditPreview(
  targetPath: string,
  input: Record<string, unknown>,
  cwd: string,
): MutationPreview {
  const edits = normalizeEditEntries(input)
  if (edits.length === 0) {
    return {
      renderer: 'fallback',
      content: 'No edit blocks provided.',
      warnings: ['No edit blocks provided.'],
    }
  }

  const absolutePath = path.resolve(cwd, targetPath)
  let currentContent: string
  try {
    currentContent = fs.readFileSync(absolutePath, 'utf8')
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''
    const message = code === 'ENOENT'
      ? `Target file not found on disk: ${targetPath}`
      : `Could not read target file at ${targetPath}; showing per-block preview instead.`
    const perBlock = buildPerBlockEditPreview(targetPath, edits, PREVIEW_MAX_LINES)

    return {
      renderer: perBlock.renderer,
      content: perBlock.content,
      warnings: [message],
    }
  }

  const plan = planEditBlocks(currentContent, edits)
  if (plan.errors.length > 0) {
    const perBlock = buildPerBlockEditPreview(targetPath, edits, PREVIEW_MAX_LINES)
    return {
      renderer: perBlock.renderer,
      content: perBlock.content,
      warnings: plan.errors,
    }
  }

  const afterContent = applyPlannedEdits(currentContent, plan.blocks)
  const inlinePreview = previewWithDelta(
    targetPath,
    currentContent,
    afterContent,
    PREVIEW_MAX_LINES,
    'inline',
  )
  if (inlinePreview) {
    return {
      renderer: 'delta',
      content: inlinePreview,
      warnings: [],
      diffSource: {
        targetPath,
        oldText: currentContent,
        newText: afterContent,
      },
    }
  }

  return {
    renderer: 'fallback',
    content: fallbackDiffPreview(currentContent, afterContent, PREVIEW_MAX_LINES),
    warnings: ['Could not render full-file diff with delta; using fallback diff preview.'],
  }
}

export function formatEditPrompt(
  targetPath: string,
  input: Record<string, unknown>,
  preview: MutationPreview,
  resolvedPreview: ResolvedPreviewContent,
): string {
  const editCount = Array.isArray(input.edits) ? input.edits.length : 0
  const viewLabel = preview.diffSource
    ? `View: ${resolvedPreview.layout} (auto side-by-side at width >= ${SIDE_BY_SIDE_MIN_WIDTH})`
    : undefined

  return [
    'Allow file edit?',
    `Path: ${targetPath}`,
    `Blocks: ${editCount}`,
    ...(viewLabel ? [viewLabel] : []),
    ...formatPreviewWarnings(preview.warnings),
    preview.renderer === 'delta' ? `Diff preview (${resolvedPreview.layout}):` : 'Preview:',
    resolvedPreview.content,
  ].join('\n')
}

function formatPreviewWarnings(warnings: string[]): string[] {
  if (warnings.length === 0) return []
  return [
    'Warnings:',
    ...warnings.map((warning) => `! ${warning}`),
  ]
}

function normalizeEditEntries(input: Record<string, unknown>): Array<{ blockIndex: number; oldText: string; newText: string }> {
  if (!Array.isArray(input.edits)) return []

  return input.edits
    .filter(
      (entry): entry is { oldText?: unknown; newText?: unknown } =>
        !!entry && typeof entry === 'object',
    )
    .map((edit, index) => ({
      blockIndex: index + 1,
      oldText: typeof edit.oldText === 'string' ? edit.oldText : String(edit.oldText ?? ''),
      newText: typeof edit.newText === 'string' ? edit.newText : String(edit.newText ?? ''),
    }))
}

function planEditBlocks(
  content: string,
  edits: Array<{ blockIndex: number; oldText: string; newText: string }>,
): { blocks: PlannedEditBlock[]; errors: string[] } {
  const blocks: PlannedEditBlock[] = []
  const errors: string[] = []

  for (const edit of edits) {
    if (!edit.oldText.length) {
      errors.push(`Edit block ${edit.blockIndex}: oldText is empty.`)
      continue
    }

    const matchIndex = content.indexOf(edit.oldText)
    if (matchIndex === -1) {
      errors.push(`Edit block ${edit.blockIndex}: oldText was not found in the current file.`)
      continue
    }

    const occurrences = countOccurrences(content, edit.oldText)
    if (occurrences > 1) {
      errors.push(`Edit block ${edit.blockIndex}: oldText matched multiple locations (${occurrences}).`)
      continue
    }

    blocks.push({
      blockIndex: edit.blockIndex,
      index: matchIndex,
      matchLength: edit.oldText.length,
      newText: edit.newText,
    })
  }

  const sorted = [...blocks].sort((a, b) => a.index - b.index)
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]
    const current = sorted[i]
    if (!previous || !current) continue

    if (current.index < previous.index + previous.matchLength) {
      errors.push(
        `Edit blocks ${previous.blockIndex} and ${current.blockIndex} overlap the same region.`,
      )
    }
  }

  return { blocks, errors }
}

function applyPlannedEdits(content: string, blocks: PlannedEditBlock[]): string {
  let next = content
  const reverseSorted = [...blocks].sort((a, b) => b.index - a.index)

  for (const block of reverseSorted) {
    next =
      next.slice(0, block.index) +
      block.newText +
      next.slice(block.index + block.matchLength)
  }

  return next
}

function buildPerBlockEditPreview(
  targetPath: string,
  edits: Array<{ blockIndex: number; oldText: string; newText: string }>,
  maxLines: number,
): { renderer: 'delta' | 'fallback'; content: string } {
  const blocks = edits.map((edit) => {
    const deltaPreview = previewWithDelta(targetPath, edit.oldText, edit.newText, maxLines)
    return {
      renderer: deltaPreview ? 'delta' as const : 'fallback' as const,
      content: [
        `Block ${edit.blockIndex}`,
        deltaPreview ?? fallbackDiffPreview(edit.oldText, edit.newText, maxLines),
      ].join('\n'),
    }
  })

  return {
    renderer: blocks.some((block) => block.renderer === 'delta') ? 'delta' : 'fallback',
    content: blocks.map((block) => block.content).join(`\n${'─'.repeat(48)}\n`),
  }
}

function countOccurrences(content: string, target: string): number {
  if (target.length === 0) return 0

  let count = 0
  let offset = 0
  while (offset <= content.length) {
    const index = content.indexOf(target, offset)
    if (index === -1) break
    count += 1
    offset = index + target.length
  }

  return count
}

function fallbackDiffPreview(
  oldText: string,
  newText: string,
  maxLines: number,
): string {
  const oldLines = oldText.replace(/\t/g, '  ').split('\n')
  const newLines = newText.replace(/\t/g, '  ').split('\n')
  const removed = oldLines.map(
    (line, index) => `-${String(index + 1).padStart(3, ' ')} | ${line}`,
  )
  const added = newLines.map(
    (line, index) => `+${String(index + 1).padStart(3, ' ')} | ${line}`,
  )
  const combined = [...removed, ...added]
  const clipped = combined.slice(0, maxLines)

  if (combined.length > maxLines) {
    clipped.push(`… ${combined.length - maxLines} more diff lines`)
  }

  return clipped.join('\n')
}

function previewWithBat(
  targetPath: string,
  content: string,
  maxLines: number,
): string | undefined {
  const bat = findCommand(['bat', 'batcat'])
  if (!bat) return undefined

  try {
    const output = cp.execFileSync(
      bat,
      ['--paging=never', '--style=plain,numbers', '--color=always', '--file-name', targetPath],
      { encoding: 'utf8', input: content, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    return clipRenderedLines(output, maxLines)
  } catch {
    return undefined
  }
}

function previewWithDelta(
  targetPath: string,
  oldText: string,
  newText: string,
  maxLines: number,
  layout: DiffPreviewLayout = 'inline',
  renderWidth?: number,
): string | undefined {
  const delta = findCommand(['delta'])
  if (!delta) return undefined

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-permission-'))
  const ext = path.extname(targetPath) || '.txt'
  const base = path.basename(targetPath, ext) || 'file'
  const oldPath = path.join(tmpDir, `${base}.before${ext}`)
  const newPath = path.join(tmpDir, `${base}.after${ext}`)

  try {
    fs.writeFileSync(oldPath, oldText, 'utf8')
    fs.writeFileSync(newPath, newText, 'utf8')
    const diff = runGitNoIndexDiff(oldPath, newPath)
    if (!diff.trim()) return undefined

    const normalizedWidth =
      typeof renderWidth === 'number' && Number.isFinite(renderWidth)
        ? Math.max(40, Math.floor(renderWidth))
        : undefined

    const deltaArgs = ['--paging=never', '--file-style=omit', '--line-numbers']
    if (normalizedWidth) {
      deltaArgs.push(`--width=${normalizedWidth}`)
    } else {
      deltaArgs.push('--width=variable')
    }

    if (layout === 'side-by-side') {
      deltaArgs.push('--side-by-side')
    }

    const rendered = cp.execFileSync(
      delta,
      deltaArgs,
      { encoding: 'utf8', input: diff, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    return clipRenderedLines(rendered, maxLines)
  } catch {
    return undefined
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function runGitNoIndexDiff(oldPath: string, newPath: string): string {
  try {
    return cp.execFileSync(
      'git',
      ['diff', '--no-index', '--no-ext-diff', '--', oldPath, newPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string'
    ) {
      return error.stdout
    }
    return ''
  }
}

function clipRenderedLines(value: string, maxLines: number): string {
  const lines = value.split('\n')
  const clipped = lines.slice(0, maxLines)
  if (lines.length > maxLines) {
    clipped.push(`… ${lines.length - maxLines} more lines`)
  }
  return clipped.join('\n')
}

function findCommand(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    try {
      const resolved = cp.execFileSync('which', [candidate], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (resolved) return resolved
    } catch {
      continue
    }
  }
  return undefined
}

function previewText(value: string, maxLines: number): string {
  if (!value) return '(empty)'

  const lines = value.replace(/\t/g, '  ').split('\n')
  const clipped = lines.slice(0, maxLines)
  const numbered = clipped.map((line, index) => `${String(index + 1).padStart(3, ' ')} | ${line}`)

  if (lines.length > maxLines) {
    numbered.push(`… ${lines.length - maxLines} more lines`)
  }

  return numbered.join('\n')
}

function countLines(value: string): number {
  if (!value) return 0
  return value.split('\n').length
}
