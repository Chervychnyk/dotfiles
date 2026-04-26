export interface EditEntry {
  blockIndex: number
  oldText: string
  newText: string
}

export interface PlannedEditBlock {
  blockIndex: number
  index: number
  matchLength: number
  newText: string
}

export function normalizeEditEntries(input: Record<string, unknown>): EditEntry[] {
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

export function planEditBlocks(
  content: string,
  edits: EditEntry[],
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

export function applyPlannedEdits(content: string, blocks: PlannedEditBlock[]): string {
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
