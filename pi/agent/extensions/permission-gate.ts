/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before running potentially dangerous bash commands.
 * Patterns checked: rm -rf, sudo, chmod/chown 777, docker/db/k8s destructive commands
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  const dangerousPatterns = [
    /\brm\s+(-rf?|--recursive)/i,
    /\bsudo\b/i,
    /\b(chmod|chown)\b.*777/i,
    /docker\s+compose\s+down\s+-v/i,
    /docker-compose\s+down\s+-v/i,
    /docker\s+system\s+prune/i,
    /docker\s+volume\s+rm/i,
    /\bdropdb\b/i,
    /rails\s+db:(drop|reset|purge)\b/i,
    /psql\s+-c\s+DROP\s+DATABASE/i,
    /kubectl\s+delete\b/i,
    /git\s+push\s+(--force|-f|--force-with-lease)\b/i,
  ]

  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'bash') return undefined

    const command = event.input.command as string
    const isDangerous = dangerousPatterns.some((p) => p.test(command))

    if (isDangerous) {
      if (!ctx.hasUI) {
        // In non-interactive mode, block by default
        return {
          block: true,
          reason: 'Dangerous command blocked (no UI for confirmation)',
        }
      }

      const choice = await ctx.ui.select(
        `⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`,
        ['Yes', 'No'],
      )

      if (choice !== 'Yes') {
        return { block: true, reason: 'Blocked by user' }
      }
    }

    return undefined
  })
}
