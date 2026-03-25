/**
 * Custom Footer Extension (adapted from telagod/oh-pi example)
 *
 * Displays: model, in/out tokens, cost, context (% + progress bar + used/window), elapsed, cwd, git branch
 */

import type { AssistantMessage } from '@mariozechner/pi-ai'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { truncateToWidth } from '@mariozechner/pi-tui'

export default function (pi: ExtensionAPI) {
  let sessionStart = Date.now()

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
      const unsub = footerData.onBranchChange(() => tui.requestRender())
      const timer = setInterval(() => tui.requestRender(), 30_000)

      return {
        dispose() {
          unsub()
          clearInterval(timer)
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
          const branchStr = branch ? theme.fg('accent', `⎇ ${branch}`) : ''

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
          const modelStr =
            theme.fg(thinkColor, '◆') + ' ' + theme.fg('accent', modelId)

          const sep = theme.fg('dim', ' | ')
          const leftParts = [modelStr, tokenStats, contextBar, elapsed, cwdStr]
          if (branchStr) leftParts.push(branchStr)
          const left = leftParts.join(sep)

          return [truncateToWidth(left, width)]
        },
      }
    })
  })

  pi.on('session_switch', async (event) => {
    if (event.reason === 'new') {
      sessionStart = Date.now()
    }
  })
}
