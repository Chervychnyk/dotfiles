/**
 * Sandbox Extension - OS-level sandboxing for bash commands
 *
 * Uses @anthropic-ai/sandbox-runtime to enforce filesystem and network
 * restrictions on bash commands at the OS level (sandbox-exec on macOS,
 * bubblewrap on Linux).
 *
 * Config files (merged, later tiers take precedence):
 * - ~/.pi/agent/sandbox.settings.json (global)
 * - <repo-root>/.agents/sandbox.settings.json (project)
 * - <repo-root>/.agents/sandbox.settings.local.json (local)
 *
 * Example .agents/sandbox.settings.json:
 * ```json
 * {
 *   "enabled": true,
 *   "network": {
 *     "allowedDomains": ["github.com", "*.github.com"],
 *     "deniedDomains": []
 *   },
 *   "filesystem": {
 *     "denyRead": ["~/.ssh", "~/.aws"],
 *     "allowWrite": [".", "/tmp"],
 *     "denyWrite": [".env"]
 *   }
 * }
 * ```
 *
 * Usage:
 * - `pi -e ./sandbox` - sandbox enabled with default/config settings
 * - `pi -e ./sandbox --no-sandbox` - disable sandboxing
 * - `/sandbox` - show current sandbox configuration
 *
 * Setup:
 * 1. Copy sandbox/ directory to ~/.pi/agent/extensions/
 * 2. Run `npm install` in ~/.pi/agent/extensions/sandbox/
 *
 * Linux also requires: bubblewrap, socat, ripgrep
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  SandboxManager,
  type SandboxRuntimeConfig,
} from '@anthropic-ai/sandbox-runtime'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import {
  type BashOperations,
  createBashTool,
} from '@mariozechner/pi-coding-agent'
import { loadExtensionSettings } from '../__lib/extension-settings.ts'

interface SandboxConfig extends SandboxRuntimeConfig {
  enabled?: boolean
}

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: true,
  network: {
    allowedDomains: [
      'npmjs.org',
      '*.npmjs.org',
      'registry.npmjs.org',
      'registry.yarnpkg.com',
      'pypi.org',
      '*.pypi.org',
      'github.com',
      '*.github.com',
      'api.github.com',
      'raw.githubusercontent.com',
    ],
    deniedDomains: [],
  },
  filesystem: {
    denyRead: ['~/.ssh', '~/.aws', '~/.gnupg'],
    allowWrite: ['.', '/tmp'],
    denyWrite: ['.env', '.env.*', '*.pem', '*.key'],
  },
}

function loadConfig(cwd: string): SandboxConfig {
  const settings = loadExtensionSettings<SandboxConfig>(
    'sandbox',
    cwd,
    deepMerge,
  )
  return deepMerge(DEFAULT_CONFIG, settings)
}

function deepMerge(
  base: SandboxConfig,
  overrides: Partial<SandboxConfig>,
): SandboxConfig {
  const result: SandboxConfig = { ...base }

  if (overrides.enabled !== undefined) result.enabled = overrides.enabled
  if (overrides.network) {
    result.network = { ...base.network, ...overrides.network }
  }
  if (overrides.filesystem) {
    result.filesystem = { ...base.filesystem, ...overrides.filesystem }
  }

  const extOverrides = overrides as {
    ignoreViolations?: Record<string, string[]>
    enableWeakerNestedSandbox?: boolean
  }
  const extResult = result as {
    ignoreViolations?: Record<string, string[]>
    enableWeakerNestedSandbox?: boolean
  }

  if (extOverrides.ignoreViolations) {
    extResult.ignoreViolations = extOverrides.ignoreViolations
  }
  if (extOverrides.enableWeakerNestedSandbox !== undefined) {
    extResult.enableWeakerNestedSandbox = extOverrides.enableWeakerNestedSandbox
  }

  return result
}

function createSandboxedBashOps(): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout }) {
      if (!existsSync(cwd)) {
        throw new Error(`Working directory does not exist: ${cwd}`)
      }

      const wrappedCommand = await SandboxManager.wrapWithSandbox(command)

      // Use spawn here instead of pi.exec because the sandbox runtime wraps a
      // long-lived shell command and the bash tool expects streamed output plus
      // process-group termination on abort/timeout.
      return new Promise((resolve, reject) => {
        const child = spawn('bash', ['-c', wrappedCommand], {
          cwd,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let timedOut = false
        let settled = false
        let timeoutHandle: NodeJS.Timeout | undefined

        const killChild = () => {
          try {
            if (child.pid) process.kill(-child.pid, 'SIGKILL')
            else child.kill('SIGKILL')
          } catch {}
        }

        const clearTimeoutHandle = () => {
          if (!timeoutHandle) return
          clearTimeout(timeoutHandle)
          timeoutHandle = undefined
        }

        const cleanup = () => {
          clearTimeoutHandle()
          signal?.removeEventListener('abort', killChild)
        }

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            killChild()
          }, timeout * 1000)
          timeoutHandle.unref()
        }

        child.stdout?.on('data', onData)
        child.stderr?.on('data', onData)

        child.on('error', (err) => {
          if (settled) return
          settled = true
          cleanup()
          reject(err)
        })

        signal?.addEventListener('abort', killChild, { once: true })

        child.on('close', (code) => {
          if (settled) return
          settled = true
          cleanup()
          if (signal?.aborted) {
            reject(new Error('aborted'))
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`))
          } else {
            resolve({ exitCode: code })
          }
        })
      })
    },
  }
}

export default function (pi: ExtensionAPI) {
  type SandboxCtx = { ui: { notify: (message: string, level: 'info' | 'warning' | 'error') => void; setStatus: (key: string, value: string | undefined) => void } }

  const clearSandboxStatus = (ctx: SandboxCtx) => {
    ctx.ui.setStatus('sandbox', undefined)
  }

  const disableSandbox = (
    ctx: SandboxCtx,
    message: string,
    level: 'info' | 'warning' | 'error',
  ) => {
    sandboxEnabled = false
    sandboxInitialized = false
    clearSandboxStatus(ctx)
    ctx.ui.notify(message, level)
  }

  pi.registerFlag('no-sandbox', {
    description: 'Disable OS-level sandboxing for bash commands',
    type: 'boolean',
    default: false,
  })

  const localCwd = process.cwd()
  const localBash = createBashTool(localCwd)

  let sandboxEnabled = false
  let sandboxInitialized = false

  pi.registerTool({
    ...localBash,
    label: 'bash (sandboxed)',
    async execute(id, params, signal, onUpdate, _ctx) {
      if (!sandboxEnabled || !sandboxInitialized) {
        return localBash.execute(id, params, signal, onUpdate)
      }

      const sandboxedBash = createBashTool(localCwd, {
        operations: createSandboxedBashOps(),
      })
      return sandboxedBash.execute(id, params, signal, onUpdate)
    },
  })

  pi.on('user_bash', () => {
    if (!sandboxEnabled || !sandboxInitialized) return
    return { operations: createSandboxedBashOps() }
  })

  pi.on('session_start', async (_event, ctx) => {
    const noSandbox = pi.getFlag('no-sandbox') as boolean

    if (noSandbox) {
      disableSandbox(ctx, 'Sandbox disabled via --no-sandbox', 'warning')
      return
    }

    const config = loadConfig(ctx.cwd)

    if (!config.enabled) {
      disableSandbox(ctx, 'Sandbox disabled via config', 'info')
      return
    }

    const platform = process.platform
    if (platform !== 'darwin' && platform !== 'linux') {
      disableSandbox(ctx, `Sandbox not supported on ${platform}`, 'warning')
      return
    }

    try {
      const configExt = config as unknown as {
        ignoreViolations?: Record<string, string[]>
        enableWeakerNestedSandbox?: boolean
      }

      await SandboxManager.initialize({
        network: config.network,
        filesystem: config.filesystem,
        ignoreViolations: configExt.ignoreViolations,
        enableWeakerNestedSandbox: configExt.enableWeakerNestedSandbox,
      })

      sandboxEnabled = true
      sandboxInitialized = true

      const networkCount = config.network?.allowedDomains?.length ?? 0
      const writeCount = config.filesystem?.allowWrite?.length ?? 0
      ctx.ui.setStatus(
        'sandbox',
        ctx.ui.theme.fg(
          'accent',
          `🔒 Sandbox: ${networkCount} domains, ${writeCount} write paths`,
        ),
      )
      ctx.ui.notify('Sandbox initialized', 'info')
    } catch (err) {
      disableSandbox(
        ctx,
        `Sandbox initialization failed: ${err instanceof Error ? err.message : err}`,
        'error',
      )
    }
  })

  pi.on('session_shutdown', async (_event, ctx) => {
    if (sandboxInitialized) {
      try {
        await SandboxManager.reset()
      } catch {
        // Ignore cleanup errors
      }
    }
    sandboxInitialized = false
    sandboxEnabled = false
    clearSandboxStatus(ctx)
  })

  pi.registerCommand('sandbox', {
    description: 'Show sandbox configuration',
    handler: async (_args, ctx) => {
      if (!sandboxEnabled) {
        ctx.ui.notify('Sandbox is disabled', 'info')
        return
      }

      const config = loadConfig(ctx.cwd)
      const lines = [
        'Sandbox Configuration:',
        '',
        'Network:',
        `  Allowed: ${config.network?.allowedDomains?.join(', ') || '(none)'}`,
        `  Denied: ${config.network?.deniedDomains?.join(', ') || '(none)'}`,
        '',
        'Filesystem:',
        `  Deny Read: ${config.filesystem?.denyRead?.join(', ') || '(none)'}`,
        `  Allow Write: ${config.filesystem?.allowWrite?.join(', ') || '(none)'}`,
        `  Deny Write: ${config.filesystem?.denyWrite?.join(', ') || '(none)'}`,
      ]
      ctx.ui.notify(lines.join('\n'), 'info')
    },
  })
}
