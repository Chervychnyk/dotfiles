/**
 * Custom Footer Extension (adapted from telagod/oh-pi example)
 *
 * Displays: model, in/out tokens, cost, context (% + progress bar + used/window), elapsed, cwd, git branch
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { truncateToWidth } from '@earendil-works/pi-tui'

const execFileAsync = promisify(execFile)

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
  'pi-permission-system': 3,
  permission: 999,
}

function getStatusOrder(key: string): number {
  return STATUS_ORDER[key] ?? 100
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
    await runGit(['rev-parse', '--is-inside-work-tree'], cwd)

    const [branchOutput, statusOutput] = await Promise.all([
      runGit(['branch', '--show-current'], cwd),
      runGit(['status', '--porcelain=v1', '--branch', '--untracked-files=normal'], cwd),
    ])

    const status: GitStatus = {
      branch: branchOutput || undefined,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      ahead: 0,
      behind: 0,
    }

    for (const line of statusOutput.split('\n')) {
      if (!line) continue

      if (line.startsWith('## ')) {
        const detached = line.match(/^## HEAD \(no branch\)$/)
        const branch = line.match(/^## ([^.\[]+)/)?.[1]
        const ahead = line.match(/ahead (\d+)/)?.[1]
        const behind = line.match(/behind (\d+)/)?.[1]
        if (!status.branch && detached) status.branch = 'detached'
        if (!status.branch && branch) status.branch = branch
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

    return status
  } catch {
    return undefined
  }
}

function formatGitStatus(status: GitStatus | undefined, fallbackBranch?: string) {
  if (!status && !fallbackBranch) return ''
  const branch = status?.branch || fallbackBranch
  const parts = branch ? [`⎇ ${branch}`] : []
  if (!status) return parts.join(' ')

  if (status.ahead > 0) parts.push(`↑${status.ahead}`)
  if (status.behind > 0) parts.push(`↓${status.behind}`)
  if (status.staged > 0) parts.push(`●${status.staged}`)
  if (status.unstaged > 0) parts.push(`✚${status.unstaged}`)
  if (status.untracked > 0) parts.push(`?${status.untracked}`)
  if (parts.length === 1) parts.push('✓')

  return parts.join(' ')
}

export default function (pi: ExtensionAPI) {
  let sessionStart = Date.now()
  let gitStatus: GitStatus | undefined

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

    ctx.ui.setFooter((tui, theme, footerData) => {
      const refreshGit = async () => {
        gitStatus = await getGitStatus(ctx.cwd)
        tui.requestRender()
      }
      void refreshGit()

      const unsub = footerData.onBranchChange(() => {
        void refreshGit()
      })
      const timer = setInterval(() => tui.requestRender(), 30_000)
      const gitTimer = setInterval(() => {
        void refreshGit()
      }, 5_000)

      return {
        dispose() {
          unsub()
          clearInterval(timer)
          clearInterval(gitTimer)
        },
        invalidate() {},
        render(width: number): string[] {
          let input = 0
          let output = 0
          let cost = 0

          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === 'message' && e.message.role === 'assistant') {
              const m = e.message as AssistantMessage
              input += m.usage.input
              output += m.usage.output
              cost += m.usage.cost.total
            }
          }

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

          const branch = footerData.getGitBranch()
          const gitStatusText = formatGitStatus(gitStatus, branch)
          const branchStr = gitStatusText ? theme.fg('accent', gitStatusText) : ''

          const thinking = pi.getThinkingLevel()
          const thinkColor =
            thinking === 'high'
              ? 'warning'
              : thinking === 'medium'
                ? 'accent'
                : thinking === 'low'
                  ? 'dim'
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
          const leftParts = [modelStr, tokenStats, contextBar, elapsed, cwdStr]
          if (branchStr) leftParts.push(branchStr)
          const left = leftParts.join(sep)

          const lines = [truncateToWidth(left, width)]

          const extensionStatuses = footerData.getExtensionStatuses()
          if (extensionStatuses.size > 0) {
            const statusLine = Array.from(extensionStatuses.entries())
              .sort(([a], [b]) => {
                const orderDiff = getStatusOrder(a) - getStatusOrder(b)
                if (orderDiff !== 0) return orderDiff
                return a.localeCompare(b)
              })
              .map(([key, text]) => {
                const cleaned = sanitizeStatusText(text)
                if (key === 'pi-permission-system' && cleaned === 'yolo') {
                  return (
                    theme.fg('error', '🚨') +
                    theme.fg('error', ' YOLO MODE')
                  )
                }
                if (key === 'permission') {
                  return theme.fg('warning', cleaned)
                }
                return cleaned
              })
              .join(' ')
            lines.push(truncateToWidth(statusLine, width, theme.fg('dim', '...')))
          }

          return lines
        },
      }
    })
  })

}
