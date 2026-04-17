/**
 * Protected Paths Extension
 *
 * Blocks write and edit operations to protected paths.
 * Useful for preventing accidental modifications to sensitive files.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

export default function (pi: ExtensionAPI) {
  const protectedPaths = [
    '.env',
    '.npmrc',
    '.pypirc',
    '.git/',
    '.ssh/',
    'config/secrets.yml',
    'config/application.yml',
    'config/database.yml',
    'config/credentials.yml',
    'config/master.key',
    'node_modules/',
    'vendor/bundle/',
    'vendor/cache/',
    '.venv/',
    '/venv/',
    'site-packages/',
    'Gemfile.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'poetry.lock',
    'uv.lock',
    'db/schema.rb',
    'db/structure.sql',
  ]

  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'write' && event.toolName !== 'edit') {
      return undefined
    }

    const path = event.input.path as string
    const isProtected = protectedPaths.some((p) => path.includes(p))

    if (isProtected) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked write to protected path: ${path}`, 'warning')
      }
      return { block: true, reason: `Path "${path}" is protected` }
    }

    return undefined
  })
}
