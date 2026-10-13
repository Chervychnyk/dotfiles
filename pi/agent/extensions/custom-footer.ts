/**
 * Custom Footer Extension (adapted from telagod/oh-pi example)
 *
 * Displays: model, in/out tokens, cost, context (% + progress bar + used/window), elapsed, cwd, git branch
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ExtensionAPI, Theme } from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

const execFileAsync = promisify(execFile)

// Git polling interval. The previous 5s spawned three processes per tick; one
// `git status` at 15s keeps the footer fresh at a fraction of the cost.
const GIT_POLL_MS = 15_000

function sanitizeStatusText(text: string): string {
  return text
    .replace(/[\r\n\t]/g, ' ')
    .replace(/ +/g, ' ')
    .trim()
}

const STATUS_ORDER: Record<string, number> = {
  mcp: 0,
  'mcp-auth': 1,
  sandbox: 2,
  permission: 999,
}

function getStatusOrder(key: string): number {
  return STATUS_ORDER[key] ?? 100
}

/**
 * Colors an extension status at render time.
 *
 * Status text is plain, so styling it inside the producing extension would bake
 * ANSI into application state and freeze the old palette: pi 1.1.0 emits no
 * theme-change event, and `docs/tui.md` warns that a theme change cannot strip
 * colors already embedded in stored state. Resolving the token here keeps the
 * status correct after `/settings` switches themes.
 */
function colorStatus(key: string, text: string, theme: Theme): string {
  if (key === 'permission') return theme.fg('warning', text)
  if (key === 'auto-mode') {
    // Yellow while auto-mode is resolving permission asks, so the session's
    // authority level is readable at a glance. Anything else is inactive.
    if (/^auto-mode:\s*error\b/.test(text)) return theme.fg('error', text)
    return /^auto-mode:\s*on\b/.test(text) ? theme.fg('warning', text) : theme.fg('dim', text)
  }
  return text
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]
  if (value === undefined) return defaultValue
  return !['0', 'false', 'no', 'off', ''].includes(value.trim().toLowerCase())
}

type FooterSegment = {
  full: string
  compact?: string
}

function joinSegments(segments: FooterSegment[], separator: string, compact = false): string {
  return segments
    .map((segment) => (compact && segment.compact ? segment.compact : segment.full))
    .filter(Boolean)
    .join(separator)
}

function wrapSegments(segments: FooterSegment[], width: number, separator: string): string[] {
  const full = joinSegments(segments, separator)
  if (visibleWidth(full) <= width) return [full]

  const compact = joinSegments(segments, separator, true)
  if (visibleWidth(compact) <= width) return [compact]

  const lines: string[] = []
  let line = ''

  for (const segment of segments) {
    const text = segment.compact || segment.full
    const candidate = line ? `${line}${separator}${text}` : text
    if (!line || visibleWidth(candidate) <= width) {
      line = candidate
      continue
    }

    lines.push(truncateToWidth(line, width))
    line = text
  }

  if (line) lines.push(truncateToWidth(line, width))
  return lines.length > 0 ? lines : ['']
}

type GitStatus = {
  branch?: string
  staged: number
  unstaged: number
  untracked: number
  ahead: number
  behind: number
}

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: 2_000,
    maxBuffer: 1024 * 1024,
  })
  return stdout.trimEnd()
}

async function getGitStatus(cwd: string): Promise<GitStatus | undefined> {
  try {
    // A single `status --porcelain --branch` reports the branch line and the
    // file list together. It exits non-zero outside a work tree, so this also
    // replaces the previous `rev-parse --is-inside-work-tree` guard.
    const statusOutput = await runGit(
      ['status', '--porcelain=v1', '--branch', '--untracked-files=normal'],
      cwd,
    )

    const status: GitStatus = {
      branch: undefined,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      ahead: 0,
      behind: 0,
    }
    let sawBranchLine = false

    for (const line of statusOutput.split('\n')) {
      if (!line) continue

      if (line.startsWith('## ')) {
        sawBranchLine = true
        const detached = line.match(/^## HEAD \(no branch\)$/)
        const branch = line.match(/^## ([^.\[]+)/)?.[1]
        const ahead = line.match(/ahead (\d+)/)?.[1]
        const behind = line.match(/behind (\d+)/)?.[1]
        if (detached) status.branch = 'detached'
        else if (branch) status.branch = branch
        if (ahead) status.ahead = Number(ahead)
        if (behind) status.behind = Number(behind)
        continue
      }

      const indexStatus = line[0]
      const worktreeStatus = line[1]
      if (indexStatus === '?' && worktreeStatus === '?') {
        status.untracked += 1
        continue
      }
      if (indexStatus && indexStatus !== ' ') status.staged += 1
      if (worktreeStatus && worktreeStatus !== ' ') status.unstaged += 1
    }

    // No `## ` header means the output came from somewhere unexpected.
    return sawBranchLine ? status : undefined
  } catch {
    return undefined
  }
}

function formatGitStatus(status: GitStatus | undefined, fallbackBranch?: string | null) {
  if (!status && !fallbackBranch) return ''
  const branch = status?.branch || fallbackBranch
  const parts = branch ? [`⎇ ${branch}`] : []
  if (!status) return parts.join(' ')

  if (status.staged > 0) parts.push(`+${status.staged}`)
  if (status.unstaged > 0) parts.push(`~${status.unstaged}`)
  if (status.untracked > 0) parts.push(`?${status.untracked}`)
  if (status.ahead > 0) parts.push(`↑${status.ahead}`)
  if (status.behind > 0) parts.push(`↓${status.behind}`)

  return parts.join(' ')
}

type TokenTotals = { input: number; output: number; cost: number }

type BranchEntry = {
  type: string
  id?: string
  message?: {
    role: string
    usage?: { input: number; output: number; cost?: { total: number } }
  }
}

let cachedTotals:
  | { length: number; lastId: string | undefined; totals: TokenTotals }
  | undefined

/**
 * Sums assistant usage across the active branch.
 *
 * `getBranch()` allocates a fresh array on every call, so walking it inside
 * `render()` is O(entries) per frame and grows with the session. Entries keep a
 * stable `id`, so cache on (length, last id): the branch only changes when an
 * entry is appended, or when the session is switched or forked, and all of
 * those move that pair. A cache miss re-walks the branch.
 */
function getTokenTotals(entries: BranchEntry[]): TokenTotals {
  const lastId = entries.length ? entries[entries.length - 1]?.id : undefined

  if (cachedTotals?.length === entries.length && cachedTotals.lastId === lastId) {
    return cachedTotals.totals
  }

  let input = 0
  let output = 0
  let cost = 0
  for (const e of entries) {
    if (e.type === 'message' && e.message?.role === 'assistant') {
      input += e.message.usage?.input ?? 0
      output += e.message.usage?.output ?? 0
      cost += e.message.usage?.cost?.total ?? 0
    }
  }

  const totals = { input, output, cost }
  cachedTotals = { length: entries.length, lastId, totals }
  return totals
}

export default function (pi: ExtensionAPI) {
  let sessionStart = Date.now()
  let gitStatus: GitStatus | undefined
  const showCwd = envFlag('PI_CUSTOM_FOOTER_SHOW_CWD', true)
  const showGit = envFlag('PI_CUSTOM_FOOTER_SHOW_GIT', true)

  function formatElapsed(ms: number): string {
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rs = s % 60
    if (m < 60) return `${m}m${rs > 0 ? rs + 's' : ''}`
    const h = Math.floor(m / 60)
    const rm = m % 60
    return `${h}h${rm > 0 ? rm + 'm' : ''}`
  }

  function fmt(n: number): string {
    if (n < 1_000) return `${n}`
    if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`
    return `${(n / 1_000_000).toFixed(1)}M`
  }

  pi.on('session_start', async (_event, ctx) => {
    sessionStart = Date.now()
    cachedTotals = undefined

    if (ctx.mode !== 'tui') return

    gitStatus = undefined
    ctx.ui.setFooter((tui, theme, footerData) => {
      let disposed = false

      const refreshGit = async () => {
        if (!showGit) return
        const nextGitStatus = await getGitStatus(ctx.cwd)
        if (disposed) return
        gitStatus = nextGitStatus
        tui.requestRender()
      }
      void refreshGit()

      const unsub = showGit
        ? footerData.onBranchChange(() => {
            void refreshGit()
          })
        : () => {}
      const timer = setInterval(() => tui.requestRender(), 30_000)
      const gitTimer = showGit
        ? setInterval(() => {
            void refreshGit()
          }, GIT_POLL_MS)
        : undefined

      return {
        dispose() {
          disposed = true
          unsub()
          clearInterval(timer)
          if (gitTimer) clearInterval(gitTimer)
        },
        invalidate() {},
        render(width: number): string[] {
          const { input, output, cost } = getTokenTotals(
            ctx.sessionManager.getBranch() as BranchEntry[],
          )

          const usage = ctx.getContextUsage()
          const pct = usage?.percent ?? 0
          const usedTokens = usage?.tokens ?? 0
          const ctxWindow = usage?.contextWindow ?? 0
          const pctColor = pct > 75 ? 'error' : pct > 50 ? 'warning' : 'success'

          const tokenStats = [
            theme.fg('accent', `↑${fmt(input)} ↓${fmt(output)}`),
            theme.fg('warning', `$${cost.toFixed(2)}`),
          ].join(' ')

          const barWidth = 12
          const clampedPct = Math.max(0, Math.min(100, pct))
          const filled = Math.round((clampedPct / 100) * barWidth)
          const empty = Math.max(0, barWidth - filled)
          const contextSize =
            ctxWindow > 0
              ? `${fmt(usedTokens)}/${fmt(ctxWindow)}`
              : `${fmt(usedTokens)}/?`
          const contextBar =
            theme.fg(pctColor, `${clampedPct.toFixed(0)}%`) +
            ' ' +
            theme.fg(pctColor, '█'.repeat(filled)) +
            theme.fg('dim', '░'.repeat(empty)) +
            ' ' +
            theme.fg('muted', contextSize)

          const elapsed = `${theme.fg('accent', '🕒')} ${theme.fg('dim', formatElapsed(Date.now() - sessionStart))}`

          const parts = ctx.cwd.split('/')
          const short = parts.length > 2 ? parts.slice(-2).join('/') : ctx.cwd
          const cwdStr = theme.fg('muted', `⌂ ${short}`)

          const branch = showGit ? footerData.getGitBranch() : undefined
          const gitStatusText = showGit ? formatGitStatus(gitStatus, branch) : ''
          const branchStr = gitStatusText ? theme.fg('accent', gitStatusText) : ''

          const thinking = pi.getThinkingLevel()
          // Mirrors the theme's own thinking ramp so the footer and the editor
          // border agree. pi supports off|minimal|low|medium|high|xhigh|max.
          const thinkColor =
            thinking === 'off'
              ? 'dim'
              : thinking === 'minimal'
                ? 'muted'
                : thinking === 'low'
                  ? 'dim'
                  : thinking === 'medium'
                    ? 'accent'
                    : thinking === 'high'
                      ? 'warning'
                      : thinking === 'xhigh'
                        ? 'warning'
                        : thinking === 'max'
                          ? 'error'
                          : 'muted'
          const modelId = ctx.model?.id || 'no-model'
          const thinkingLabel = thinking || 'default'
          const modelStr =
            theme.fg(thinkColor, '◆') +
            ' ' +
            theme.fg('accent', modelId) +
            ' ' +
            theme.fg(thinkColor, `(${thinkingLabel})`)

          const sep = theme.fg('dim', ' | ')
          const leftParts: FooterSegment[] = [
            { full: modelStr, compact: theme.fg('accent', modelId) },
            { full: tokenStats, compact: theme.fg('accent', `↑${fmt(input)} ↓${fmt(output)}`) },
            {
              full: contextBar,
              compact: theme.fg(pctColor, `${clampedPct.toFixed(0)}%`) + ' ' + theme.fg('muted', contextSize),
            },
            { full: elapsed, compact: theme.fg('dim', formatElapsed(Date.now() - sessionStart)) },
          ]
          if (showCwd) leftParts.push({ full: cwdStr, compact: theme.fg('muted', short) })
          if (showGit && branchStr) leftParts.push({ full: branchStr, compact: branchStr })

          const lines = wrapSegments(leftParts, width, sep)

          const extensionStatuses = footerData.getExtensionStatuses()
          if (extensionStatuses.size > 0) {
            const statusLine = Array.from(extensionStatuses.entries())
              .sort(([a], [b]) => {
                const orderDiff = getStatusOrder(a) - getStatusOrder(b)
                if (orderDiff !== 0) return orderDiff
                return a.localeCompare(b)
              })
              .map(([key, text]) => colorStatus(key, sanitizeStatusText(text), theme))
              .join(' ')
            lines.push(truncateToWidth(statusLine, width, theme.fg('dim', '...')))
          }

          return lines
        },
      }
    })
  })

}
