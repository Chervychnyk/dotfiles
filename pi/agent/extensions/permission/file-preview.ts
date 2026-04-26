import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  applyPlannedEdits,
  normalizeEditEntries,
  planEditBlocks,
  type EditEntry,
} from './edit-planner.ts'
import {
  previewWithBat,
  previewWithDelta,
  previewWithGitDiff,
  previewWithShiki,
} from './diff-renderers.ts'
import { formatEditPrompt, formatWritePrompt } from './prompt-format.ts'
import {
  DEFAULT_PREVIEW_WIDTH,
  PREVIEW_MAX_LINES,
  SIDE_BY_SIDE_MIN_WIDTH,
  type DiffPreviewOptions,
  type MutationPreview,
  type PreviewRenderer,
  type ResolvedPreviewContent,
} from './preview-types.ts'
import {
  fallbackDiffPreview,
  isDiffInputTooLarge,
  largeDiffPreview,
  previewText,
} from './preview-text.ts'

export { formatEditPrompt, formatWritePrompt }
export { SIDE_BY_SIDE_MIN_WIDTH }
export type {
  DiffPreviewOptions,
  MutationPreview,
  PreviewRenderer,
  ResolvedPreviewContent,
}

export async function getWritePreview(
  targetPath: string,
  input: Record<string, unknown>,
  cwd: string,
  options: DiffPreviewOptions = {},
): Promise<MutationPreview> {
  const content = typeof input.content === 'string' ? input.content : ''
  const absolutePath = path.resolve(cwd, targetPath)
  const warnings: string[] = []

  let existingContent: string | undefined
  try {
    existingContent = fs.readFileSync(absolutePath, 'utf8')
  } catch (error) {
    const code = getErrorCode(error)
    if (code !== 'ENOENT') {
      warnings.push(`Could not read existing file at ${targetPath}; showing write content preview only.`)
    }
  }

  if (existingContent !== undefined) {
    const diffPreview = await buildFullFileMutationPreview(
      targetPath,
      existingContent,
      content,
      warnings,
      options,
      'overwrite',
    )
    if (diffPreview) return diffPreview
  }

  const batPreview = previewWithBat(targetPath, content, PREVIEW_MAX_LINES)
  if (batPreview) {
    return { renderer: 'bat', content: batPreview, warnings }
  }

  warnings.push('bat unavailable or failed; using plain text preview.')
  return { renderer: 'fallback', content: previewText(content, PREVIEW_MAX_LINES), warnings }
}

export async function getEditPreview(
  targetPath: string,
  input: Record<string, unknown>,
  cwd: string,
  options: DiffPreviewOptions = {},
): Promise<MutationPreview> {
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
    const code = getErrorCode(error)
    const message = code === 'ENOENT'
      ? `Target file not found on disk: ${targetPath}`
      : `Could not read target file at ${targetPath}; showing per-block preview instead.`
    const perBlock = await buildPerBlockEditPreview(targetPath, edits, PREVIEW_MAX_LINES, options)

    return {
      renderer: perBlock.renderer,
      content: perBlock.content,
      warnings: [message],
    }
  }

  const plan = planEditBlocks(currentContent, edits)
  if (plan.errors.length > 0) {
    const perBlock = await buildPerBlockEditPreview(targetPath, edits, PREVIEW_MAX_LINES, options)
    return {
      renderer: perBlock.renderer,
      content: perBlock.content,
      warnings: plan.errors,
    }
  }

  const afterContent = applyPlannedEdits(currentContent, plan.blocks)
  return await buildFullFileMutationPreview(
    targetPath,
    currentContent,
    afterContent,
    [],
    options,
    'edit',
  ) ?? {
    renderer: 'fallback',
    content: fallbackDiffPreview(currentContent, afterContent, PREVIEW_MAX_LINES),
    warnings: ['Could not render full-file diff; using fallback diff preview.'],
  }
}

export function resolvePreviewContentForWidth(
  preview: MutationPreview,
  width: number,
  cache?: Map<string, string | undefined>,
): ResolvedPreviewContent {
  if (preview.renderer !== 'delta' && preview.renderer !== 'shiki') {
    return { content: preview.content, layout: 'inline' }
  }

  if (width >= SIDE_BY_SIDE_MIN_WIDTH) {
    const sideBySide = getCachedSideBySidePreviewForWidth(preview, width, cache)
    if (sideBySide) {
      return { content: sideBySide, layout: 'side-by-side' }
    }
  }

  return { content: preview.content, layout: 'inline' }
}

async function buildFullFileMutationPreview(
  targetPath: string,
  oldText: string,
  newText: string,
  warnings: string[],
  options: DiffPreviewOptions,
  mode: 'edit' | 'overwrite',
): Promise<MutationPreview | undefined> {
  if (oldText === newText) {
    return {
      renderer: 'none',
      content: 'No textual changes.',
      warnings,
    }
  }

  if (isDiffInputTooLarge(oldText, newText)) {
    const message = mode === 'edit'
      ? 'File is too large for full diff rendering; showing proposed content summary.'
      : 'File is too large for diff rendering; showing proposed content with bat.'
    warnings.push(message)
    return mode === 'edit'
      ? { renderer: 'fallback', content: largeDiffPreview(oldText, newText), warnings }
      : undefined
  }

  const diffSource = { targetPath, oldText, newText }
  const shikiPreview = await previewWithShiki(
    targetPath,
    oldText,
    newText,
    PREVIEW_MAX_LINES,
    options,
    'side-by-side',
    Math.max(DEFAULT_PREVIEW_WIDTH, SIDE_BY_SIDE_MIN_WIDTH),
  )
  if (shikiPreview) {
    return { renderer: 'shiki', content: shikiPreview, warnings, diffSource }
  }

  const deltaPreview = previewWithDelta(targetPath, oldText, newText, PREVIEW_MAX_LINES, 'inline')
  if (deltaPreview) {
    return { renderer: 'delta', content: deltaPreview, warnings, diffSource }
  }

  const gitPreview = previewWithGitDiff(targetPath, oldText, newText, PREVIEW_MAX_LINES)
  if (gitPreview) {
    const message = mode === 'edit'
      ? 'Could not render full-file diff with delta; using git diff preview.'
      : 'Could not render overwrite diff with delta; using git diff preview.'
    return {
      renderer: 'fallback',
      content: gitPreview,
      warnings: [...warnings, message],
      diffSource,
    }
  }

  if (mode === 'overwrite') {
    warnings.push('Could not render overwrite diff; showing proposed content with bat.')
    return undefined
  }

  return undefined
}

async function buildPerBlockEditPreview(
  targetPath: string,
  edits: EditEntry[],
  maxLines: number,
  options: DiffPreviewOptions,
): Promise<{ renderer: 'shiki' | 'delta' | 'fallback'; content: string }> {
  const blocks = await Promise.all(edits.map(async (edit) => {
    const shikiPreview = await previewWithShiki(targetPath, edit.oldText, edit.newText, maxLines, options)
    const deltaPreview = shikiPreview ? undefined : previewWithDelta(targetPath, edit.oldText, edit.newText, maxLines)
    const fallbackPreview = isDiffInputTooLarge(edit.oldText, edit.newText)
      ? largeDiffPreview(edit.oldText, edit.newText)
      : fallbackDiffPreview(edit.oldText, edit.newText, maxLines)
    return {
      renderer: shikiPreview ? 'shiki' as const : deltaPreview ? 'delta' as const : 'fallback' as const,
      content: [
        `Block ${edit.blockIndex}`,
        shikiPreview ?? deltaPreview ?? fallbackPreview,
      ].join('\n'),
    }
  }))

  const renderer = blocks.every((block) => block.renderer === 'shiki')
    ? 'shiki'
    : blocks.every((block) => block.renderer === 'delta')
      ? 'delta'
      : 'fallback'

  return {
    renderer,
    content: blocks.map((block) => block.content).join(`\n${'─'.repeat(48)}\n`),
  }
}

function getCachedSideBySidePreviewForWidth(
  preview: MutationPreview,
  width: number,
  cache?: Map<string, string | undefined>,
): string | undefined {
  if (!preview.diffSource) return undefined

  const normalizedWidth = Math.max(40, Math.floor(width))
  const key = `${preview.renderer}:side-by-side:${normalizedWidth}`
  if (cache?.has(key)) {
    return cache.get(key)
  }

  const rendered = preview.renderer === 'shiki'
    ? undefined
    : previewWithDelta(
      preview.diffSource.targetPath,
      preview.diffSource.oldText,
      preview.diffSource.newText,
      PREVIEW_MAX_LINES,
      'side-by-side',
      normalizedWidth,
    )

  cache?.set(key, rendered)
  return rendered
}

function getErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
}
