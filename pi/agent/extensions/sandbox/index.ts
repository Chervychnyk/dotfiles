/**
 * Sandbox Extension - OS-level sandboxing plus promptable tool permissions.
 *
 * Uses @anthropic-ai/sandbox-runtime to enforce filesystem and network
 * restrictions on bash commands at the OS level (sandbox-exec on macOS,
 * bubblewrap on Linux). Also intercepts direct pi tools that do not run inside
 * the OS sandbox: read, write, edit, web_fetch, and batch_web_fetch.
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
 *     "allowRead": ["."],
 *     "denyRead": ["~/.ssh", "~/.aws"],
 *     "allowWrite": [".", "/tmp"],
 *     "denyWrite": [".env", ".env.*", "*.pem", "*.key"]
 *   }
 * }
 * ```
 *
 * Prompt behavior:
 * - Network domains not in allowedDomains are prompted for web_fetch,
 *   batch_web_fetch, and bash commands containing explicit http(s) URLs.
 * - read prompts when the path is not in filesystem.allowRead.
 * - write/edit prompt when the path is not in filesystem.allowWrite.
 * - filesystem.denyWrite is a hard block and is not promptable.
 * - network.deniedDomains is enforced by the runtime and should be treated as
 *   a hard block.
 * - Grants can be session-only, project-local, or global. Session grants are
 *   shown by /sandbox and reset on reload/restart.
 *
 * Usage:
 * - `pi -e ./sandbox` - sandbox enabled with default/config settings
 * - `pi -e ./sandbox --no-sandbox` - disable sandboxing
 * - `/sandbox` - show current sandbox configuration and session grants
 *
 * Setup:
 * 1. Copy sandbox/ directory to ~/.pi/agent/extensions/
 * 2. Run `npm install` in ~/.pi/agent/extensions/sandbox/
 *
 * Linux also requires: bubblewrap, socat, ripgrep
 */

import { SandboxManager } from '@anthropic-ai/sandbox-runtime'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { createBashTool } from '@earendil-works/pi-coding-agent'
import { getExtensionSettingsPaths } from '../__lib/extension-settings.ts'
import {
  ALLOW_READ_KEY,
  ALLOW_WRITE_KEY,
  EXTENSION_NAME,
  loadConfig,
  updateAllowedDomains,
  updateFilesystemAllowList,
  type SandboxConfig,
} from './config.ts'
import {
  buildRuntimeConfigWithSessionGrants,
  domainMatches,
  extractCommandDomains,
  extractDomainsFromUrls,
  pathMatchesAny,
  resolveSandboxPath,
  type PermissionChoice,
} from './policy.ts'
import { askPermission, type SandboxCtx } from './permission-ui.ts'
import { createSandboxedBashOps } from './runtime.ts'

const SANDBOX_STATUS_KEY = 'sandbox'
const NO_SANDBOX_FLAG = 'no-sandbox'
const NETWORK_BLOCK_REASON = 'Blocked by sandbox network policy'
const FILESYSTEM_BLOCK_REASON = 'Blocked by sandbox filesystem policy'
const WEB_FETCH_TOOLS = new Set(['web_fetch', 'batch_web_fetch'])
const READ_TOOL = 'read'
const WRITE_TOOLS = new Set(['write', 'edit'])

function allowsAllDomains(config: SandboxConfig) {
  return config.network?.allowedDomains?.includes('*') ?? false
}

function isDomainAllowed(config: SandboxConfig, sessionDomains: Set<string>, domain: string) {
  const denied = config.network?.deniedDomains ?? []
  if (denied.some((pattern) => domainMatches(pattern, domain))) return false
  if (sessionDomains.has(domain)) return true
  const allowed = config.network?.allowedDomains ?? []
  return allowed.some((pattern) => domainMatches(pattern, domain))
}

function extractFetchDomains(input: unknown) {
  const urls: unknown[] = []

  if (!input || typeof input !== 'object') return []
  const record = input as Record<string, unknown>
  urls.push(record.url)

  if (Array.isArray(record.requests)) {
    for (const request of record.requests) {
      if (request && typeof request === 'object') {
        urls.push((request as Record<string, unknown>).url)
      }
    }
  }

  return extractDomainsFromUrls(urls)
}

function extractToolPath(input: unknown) {
  if (!input || typeof input !== 'object') return undefined
  const value = (input as Record<string, unknown>).path
  return typeof value === 'string' ? value : undefined
}

function renderSandboxStatus(config: SandboxConfig) {
  const networkCount = config.network?.allowedDomains?.length ?? 0
  const writeCount = config.filesystem?.allowWrite?.length ?? 0
  return `🔒 Sandbox: ${networkCount} domains, ${writeCount} write paths`
}

function renderSandboxDetails(
  config: SandboxConfig,
  sessionAllowedDomains: Set<string>,
  sessionAllowedReadPaths: Set<string>,
  sessionAllowedWritePaths: Set<string>,
) {
  return [
    'Sandbox Configuration:',
    '',
    'Network:',
    `  Allowed: ${config.network?.allowedDomains?.join(', ') || '(none)'}`,
    ...(allowsAllDomains(config)
      ? ['  ⚠️ "*" allows all domains and disables per-domain prompts.']
      : []),
    `  Denied: ${config.network?.deniedDomains?.join(', ') || '(none)'}`,
    ...(sessionAllowedDomains.size > 0
      ? [`  Session allowed: ${[...sessionAllowedDomains].sort().join(', ')}`]
      : []),
    '',
    'Filesystem:',
    `  Allow Read: ${config.filesystem?.allowRead?.join(', ') || '(none)'}`,
    `  Deny Read: ${config.filesystem?.denyRead?.join(', ') || '(none)'}`,
    ...(sessionAllowedReadPaths.size > 0
      ? [`  Session read: ${[...sessionAllowedReadPaths].sort().join(', ')}`]
      : []),
    `  Allow Write: ${config.filesystem?.allowWrite?.join(', ') || '(none)'}`,
    `  Deny Write: ${config.filesystem?.denyWrite?.join(', ') || '(none)'}`,
    ...(sessionAllowedWritePaths.size > 0
      ? [`  Session write: ${[...sessionAllowedWritePaths].sort().join(', ')}`]
      : []),
  ]
}

export default function (pi: ExtensionAPI) {

  const clearSandboxStatus = (ctx: SandboxCtx) => {
    ctx.ui.setStatus(SANDBOX_STATUS_KEY, undefined)
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

  pi.registerFlag(NO_SANDBOX_FLAG, {
    description: 'Disable OS-level sandboxing for bash commands',
    type: 'boolean',
    default: false,
  })

  const localCwd = process.cwd()
  const localBash = createBashTool(localCwd)

  let sandboxEnabled = false
  let sandboxInitialized = false
  let sandboxedBash: ReturnType<typeof createBashTool> | undefined
  const sessionAllowedDomains = new Set<string>()
  const sessionAllowedReadPaths = new Set<string>()
  const sessionAllowedWritePaths = new Set<string>()

  function buildRuntimeConfig(config: SandboxConfig): SandboxConfig {
    return buildRuntimeConfigWithSessionGrants(config, {
      domains: sessionAllowedDomains,
      readPaths: sessionAllowedReadPaths,
      writePaths: sessionAllowedWritePaths,
    })
  }

  async function initializeSandbox(config: SandboxConfig) {
    const runtimeConfig = buildRuntimeConfig(config)
    const configExt = runtimeConfig as unknown as {
      ignoreViolations?: Record<string, string[]>
      enableWeakerNestedSandbox?: boolean
    }

    if (sandboxInitialized) {
      await SandboxManager.reset()
      sandboxInitialized = false
    }

    await SandboxManager.initialize({
      network: runtimeConfig.network,
      filesystem: runtimeConfig.filesystem,
      ignoreViolations: configExt.ignoreViolations,
      enableWeakerNestedSandbox: configExt.enableWeakerNestedSandbox,
    })

    sandboxedBash = createBashTool(localCwd, {
      operations: createSandboxedBashOps(),
    })
    sandboxEnabled = true
    sandboxInitialized = true
  }

  async function applyGrant(options: {
    ctx: SandboxCtx
    choice: PermissionChoice
    cwd: string
    values: string[]
    sessionSet: Set<string>
    persist: (target: string, values: string[]) => void
    successMessage: (target: string) => string
  }) {
    const { ctx, choice, cwd, values, sessionSet, persist, successMessage } = options

    if (choice === 'session') {
      for (const value of values) sessionSet.add(value)
      await initializeSandbox(loadConfig(cwd))
      return true
    }

    if (choice !== 'project' && choice !== 'global') return false

    const paths = getExtensionSettingsPaths(EXTENSION_NAME, cwd)
    const target = choice === 'global' ? paths.global : paths.project
    try {
      persist(target, values)
      for (const value of values) sessionSet.add(value)
      await initializeSandbox(loadConfig(cwd))
      ctx.ui.notify(successMessage(target), 'info')
      return true
    } catch (err) {
      ctx.ui.notify(
        `Failed to update sandbox config: ${err instanceof Error ? err.message : err}`,
        'error',
      )
      return false
    }
  }

  async function promptForDomains(ctx: SandboxCtx, domains: string[]) {
    const config = loadConfig(ctx.cwd ?? localCwd)
    const blocked = domains.filter(
      (domain) => !isDomainAllowed(config, sessionAllowedDomains, domain),
    )
    if (blocked.length === 0) return true

    const prompt = `Sandbox blocked network domain${blocked.length === 1 ? '' : 's'}: ${blocked.join(', ')}`
    const choice = await askPermission(ctx, prompt)

    return applyGrant({
      ctx,
      choice,
      cwd: ctx.cwd ?? localCwd,
      values: blocked,
      sessionSet: sessionAllowedDomains,
      persist: updateAllowedDomains,
      successMessage: (target) => `Sandbox allowed ${blocked.join(', ')} in ${target}`,
    })
  }

  async function promptForPath(
    ctx: SandboxCtx,
    rawPath: string,
    access: 'read' | 'write',
  ) {
    const cwd = ctx.cwd ?? localCwd
    const config = loadConfig(cwd)
    const absolutePath = resolveSandboxPath(cwd, rawPath)
    const filesystem = config.filesystem ?? {}

    if (access === 'write' && pathMatchesAny(absolutePath, filesystem.denyWrite, cwd)) {
      ctx.ui.notify(`Sandbox hard-blocked write to ${rawPath} because it matches denyWrite`, 'error')
      return false
    }

    const sessionSet = access === 'read' ? sessionAllowedReadPaths : sessionAllowedWritePaths
    const allowKey = access === 'read' ? ALLOW_READ_KEY : ALLOW_WRITE_KEY
    const allowedPatterns = filesystem[allowKey] ?? []
    const alreadyAllowed =
      sessionSet.has(absolutePath) || pathMatchesAny(absolutePath, allowedPatterns, cwd)
    if (alreadyAllowed) return true

    const prompt = `Sandbox blocked ${access} path: ${rawPath}`
    const choice = await askPermission(ctx, prompt)

    return applyGrant({
      ctx,
      choice,
      cwd,
      values: [absolutePath],
      sessionSet,
      persist: (target, values) => updateFilesystemAllowList(target, allowKey, values),
      successMessage: (target) => `Sandbox allowed ${access} ${absolutePath} in ${target}`,
    })
  }

  pi.registerTool({
    ...localBash,
    label: 'bash (sandboxed)',
    async execute(id, params, signal, onUpdate, ctx) {
      if (!sandboxEnabled || !sandboxInitialized) {
        return localBash.execute(id, params, signal, onUpdate)
      }

      const command = typeof params.command === 'string' ? params.command : ''
      const allowed = await promptForDomains(ctx, extractCommandDomains(command))
      if (!allowed) {
        return {
          content: [{ type: 'text', text: NETWORK_BLOCK_REASON }],
          isError: true,
        }
      }

      return (sandboxedBash ?? localBash).execute(id, params, signal, onUpdate)
    },
  })

  pi.on('user_bash', async (event, ctx) => {
    if (!sandboxEnabled || !sandboxInitialized) return
    const allowed = await promptForDomains(ctx, extractCommandDomains(event.command))
    if (!allowed) {
      return {
        result: {
          output: NETWORK_BLOCK_REASON,
          exitCode: 1,
          cancelled: false,
          truncated: false,
        },
      }
    }
    return { operations: createSandboxedBashOps() }
  })

  pi.on('tool_call', async (event, ctx) => {
    if (!sandboxEnabled || !sandboxInitialized) return

    if (WEB_FETCH_TOOLS.has(event.toolName)) {
      const allowed = await promptForDomains(ctx, extractFetchDomains(event.input))
      if (!allowed) return { block: true, reason: NETWORK_BLOCK_REASON }
      return
    }

    if (event.toolName === READ_TOOL) {
      const targetPath = extractToolPath(event.input)
      if (!targetPath) return
      const allowed = await promptForPath(ctx, targetPath, 'read')
      if (!allowed) return { block: true, reason: FILESYSTEM_BLOCK_REASON }
      return
    }

    if (WRITE_TOOLS.has(event.toolName)) {
      const targetPath = extractToolPath(event.input)
      if (!targetPath) return
      const allowed = await promptForPath(ctx, targetPath, 'write')
      if (!allowed) return { block: true, reason: FILESYSTEM_BLOCK_REASON }
    }
  })

  pi.on('session_start', async (_event, ctx) => {
    const noSandbox = pi.getFlag(NO_SANDBOX_FLAG) as boolean

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
      await initializeSandbox(config)

      if (allowsAllDomains(config)) {
        ctx.ui.notify(
          '⚠️ Network sandbox allows all domains because network.allowedDomains contains "*".',
          'warning',
        )
      }

      ctx.ui.setStatus(
        SANDBOX_STATUS_KEY,
        ctx.ui.theme.fg('accent', renderSandboxStatus(config)),
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
    sandboxedBash = undefined
    clearSandboxStatus(ctx)
  })

  pi.registerCommand(EXTENSION_NAME, {
    description: 'Show sandbox configuration',
    handler: async (_args, ctx) => {
      if (!sandboxEnabled) {
        ctx.ui.notify('Sandbox is disabled', 'info')
        return
      }

      const config = loadConfig(ctx.cwd)
      const lines = renderSandboxDetails(
        config,
        sessionAllowedDomains,
        sessionAllowedReadPaths,
        sessionAllowedWritePaths,
      )
      ctx.ui.notify(lines.join('\n'), 'info')
    },
  })
}
