import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from '@mariozechner/pi-coding-agent'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const DEFAULT_TIMEOUT = 10_000

export type TruncationResult = {
  text: string
  truncated: boolean
  tempFile?: string
  totalBytes: number
  totalLines: number
  maxChars?: number
  charLimited: boolean
  originalChars: number
}

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ *\n */g, '\n')
    .trim()
}

export function createAbortController(timeoutMs: number, signal?: AbortSignal) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', onAbort, { once: true })
    }
  }

  return {
    controller,
    cleanup: () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
    },
  }
}

function writeTruncatedOutput(content: string, extension: string): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'pi-web-tools-'))
  const tempFile = path.join(tempDir, `content${extension}`)
  writeFileSync(tempFile, content, 'utf8')
  return tempFile
}

export function limitByChars(content: string, maxChars?: number) {
  const originalChars = content.length

  if (!maxChars) {
    return {
      content,
      maxChars: undefined,
      charLimited: false,
      originalChars,
    }
  }

  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new Error(`Invalid maxChars: ${maxChars}`)
  }

  if (content.length <= maxChars) {
    return {
      content,
      maxChars,
      charLimited: false,
      originalChars,
    }
  }

  return {
    content: `${content.slice(0, maxChars).trimEnd()}\n\n---\n[Character limit applied: showing first ${maxChars} of ${originalChars} characters]`,
    maxChars,
    charLimited: true,
    originalChars,
  }
}

export function truncateForModel(
  content: string,
  extension: string,
  maxChars?: number,
): TruncationResult {
  const limited = limitByChars(content, maxChars)
  const truncation = truncateHead(limited.content, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  })

  if (!truncation.truncated) {
    return {
      text: limited.content,
      truncated: false,
      totalBytes: truncation.totalBytes,
      totalLines: truncation.totalLines,
      maxChars: limited.maxChars,
      charLimited: limited.charLimited,
      originalChars: limited.originalChars,
    }
  }

  const tempFile = writeTruncatedOutput(limited.content, extension)
  return {
    text: `${truncation.content}\n\n---\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]\nFull output saved to: ${tempFile}`,
    truncated: true,
    tempFile,
    totalBytes: truncation.totalBytes,
    totalLines: truncation.totalLines,
    maxChars: limited.maxChars,
    charLimited: limited.charLimited,
    originalChars: limited.originalChars,
  }
}

export function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

export function renderBadges(
  theme: any,
  details: {
    truncated?: boolean
    charLimited?: boolean
    selector?: string
    extractionMethod?: string
    cloudflareBypassed?: boolean
  },
) {
  const badges: string[] = []
  if (details.charLimited) badges.push(theme.fg('warning', 'chars-limited'))
  if (details.truncated) badges.push(theme.fg('warning', 'truncated'))
  if (details.cloudflareBypassed)
    badges.push(theme.fg('warning', 'cf-retry'))
  if (details.extractionMethod)
    badges.push(theme.fg('muted', details.extractionMethod))
  if (details.selector)
    badges.push(theme.fg('muted', `selector=${details.selector}`))
  return badges.length ? ` ${badges.join(' ')}` : ''
}
