import { DIFF_MAX_BYTES, DIFF_MAX_LINES, PREVIEW_MAX_LINES } from './preview-types.ts'

export function isDiffInputTooLarge(oldText: string, newText: string): boolean {
  return Buffer.byteLength(oldText, 'utf8') + Buffer.byteLength(newText, 'utf8') > DIFF_MAX_BYTES ||
    countLines(oldText) + countLines(newText) > DIFF_MAX_LINES
}

export function largeDiffPreview(oldText: string, newText: string): string {
  return [
    `Diff omitted: ${countLines(oldText)} old lines / ${countLines(newText)} new lines, ${Buffer.byteLength(oldText, 'utf8')} old bytes / ${Buffer.byteLength(newText, 'utf8')} new bytes.`,
    '',
    'Proposed content preview:',
    previewText(newText, Math.min(200, PREVIEW_MAX_LINES)),
  ].join('\n')
}

export function fallbackDiffPreview(
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

export function clipRenderedLines(value: string, maxLines: number): string {
  const normalized = value.endsWith('\n') ? value.slice(0, -1) : value
  const lines = normalized.split('\n')
  const clipped = lines.slice(0, maxLines)
  if (lines.length > maxLines) {
    clipped.push(`… ${lines.length - maxLines} more lines`)
  }
  return clipped.join('\n')
}

export function previewText(value: string, maxLines: number): string {
  if (!value) return '(empty)'

  const lines = value.replace(/\t/g, '  ').split('\n')
  const clipped = lines.slice(0, maxLines)
  const numbered = clipped.map((line, index) => `${String(index + 1).padStart(3, ' ')} | ${line}`)

  if (lines.length > maxLines) {
    numbered.push(`… ${lines.length - maxLines} more lines`)
  }

  return numbered.join('\n')
}

export function countLines(value: string): number {
  if (!value) return 0
  const normalized = value.endsWith('\n') ? value.slice(0, -1) : value
  return normalized ? normalized.split('\n').length : 0
}
