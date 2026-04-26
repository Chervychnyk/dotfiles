import * as cp from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { type DiffPreviewLayout } from './preview-types.ts'
import { clipRenderedLines, isDiffInputTooLarge } from './preview-text.ts'
export { previewWithShiki } from './shiki-renderer.ts'

export function previewWithBat(
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

export function previewWithDelta(
  targetPath: string,
  oldText: string,
  newText: string,
  maxLines: number,
  layout: DiffPreviewLayout = 'inline',
  renderWidth?: number,
): string | undefined {
  if (isDiffInputTooLarge(oldText, newText)) return undefined

  const delta = findCommand(['delta'])
  if (!delta) return undefined

  const diff = buildGitNoIndexDiff(targetPath, oldText, newText)
  if (!diff?.trim()) return undefined

  try {
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
  }
}

export function previewWithGitDiff(
  targetPath: string,
  oldText: string,
  newText: string,
  maxLines: number,
): string | undefined {
  if (isDiffInputTooLarge(oldText, newText)) return undefined

  const diff = buildGitNoIndexDiff(targetPath, oldText, newText)
  return diff?.trim() ? clipRenderedLines(diff, maxLines) : undefined
}

function buildGitNoIndexDiff(
  targetPath: string,
  oldText: string,
  newText: string,
): string | undefined {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-permission-'))
  const ext = path.extname(targetPath) || '.txt'
  const base = path.basename(targetPath, ext) || 'file'
  const oldPath = path.join(tmpDir, `${base}.before${ext}`)
  const newPath = path.join(tmpDir, `${base}.after${ext}`)

  try {
    fs.writeFileSync(oldPath, oldText, 'utf8')
    fs.writeFileSync(newPath, newText, 'utf8')
    return runGitNoIndexDiff(oldPath, newPath)
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

const commandCache = new Map<string, string | undefined>()

function findCommand(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (commandCache.has(candidate)) {
      const cached = commandCache.get(candidate)
      if (cached) return cached
      continue
    }

    try {
      const resolved = cp.execFileSync('which', [candidate], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      commandCache.set(candidate, resolved || undefined)
      if (resolved) return resolved
    } catch {
      commandCache.set(candidate, undefined)
    }
  }
  return undefined
}
