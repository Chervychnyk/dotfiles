import type { MutationPreview, ResolvedPreviewContent } from './preview-types.ts'
import { countLines } from './preview-text.ts'

export function formatWritePrompt(
  targetPath: string,
  input: Record<string, unknown>,
  preview: MutationPreview,
  resolvedPreview: ResolvedPreviewContent,
): string {
  const content = typeof input.content === 'string' ? input.content : ''
  const lines = countLines(content)
  const bytes = Buffer.byteLength(content, 'utf8')
  const previewLabel = preview.renderer === 'none'
    ? 'Change summary:'
    : preview.renderer === 'delta'
      ? `Diff preview (${resolvedPreview.layout}):`
      : preview.diffSource
        ? `Diff preview${preview.renderer === 'shiki' ? ' (shiki)' : ''}:`
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

export function formatEditPrompt(
  targetPath: string,
  input: Record<string, unknown>,
  preview: MutationPreview,
  resolvedPreview: ResolvedPreviewContent,
): string {
  const editCount = Array.isArray(input.edits) ? input.edits.length : 0

  return [
    'Allow file edit?',
    `Path: ${targetPath}`,
    `Blocks: ${editCount}`,
    ...formatPreviewWarnings(preview.warnings),
    preview.renderer === 'none'
      ? 'Change summary:'
      : preview.renderer === 'delta'
        ? `Diff preview (${resolvedPreview.layout}):`
        : preview.diffSource
          ? `Diff preview${preview.renderer === 'shiki' ? ' (shiki)' : ''}:`
          : 'Preview:',
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
