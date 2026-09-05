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
 *     "allowWrite": [".", "/tmp"]
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
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBashTool } from '@earendil-works/pi-coding-agent'
import { getExtensionSettingsPaths } from '../__lib/extension-settings.ts'
import { createApprovalBroker } from './approval-broker.ts'
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
  decideFilesystemAccess,
  domainMatches,
  extractCommandDomains,
  extractDomainsFromUrls,
} from './policy.ts'
import { askPermission, type SandboxCtx } from './permission-ui.ts'
import {
  RUNTIME_UNAVAILABLE_BLOCK_REASON,
  createSandboxRuntimeLifecycle,
} from './lifecycle.ts'
import { createSandboxedBashOps } from './runtime.ts'

const SANDBOX_STATUS_KEY = 'sandbox'
const NO_SANDBOX_FLAG = 'no-sandbox'
const NETWORK_BLOCK_REASON = 'Blocked by sandbox network policy'
const FILESYSTEM_BLOCK_REASON = 'Blocked by sandbox filesystem policy'
const WEB_FETCH_TOOLS = new Set(['web_fetch', 'batch_web_fetch'])
const PATH_TOOL_ACCESS: Record<string, 'read' | 'write'> = {
  read: 'read',
  write: 'write',
  edit: 'write',
}

function blockedBashResult(output: string) {
  return { result: { output, exitCode: 1, cancelled: false, truncated: false } }
}

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
    allowLocal = false,
  ) => {
    runtimeLifecycle.disable({ allowLocal })
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
  const sandboxImplementationDir = path.dirname(fileURLToPath(import.meta.url))

  function protectedRoots(cwd: string) {
    const settingsPaths = getExtensionSettingsPaths(EXTENSION_NAME, cwd)
    return {
      sandboxDirs: [
        path.join(path.dirname(settingsPaths.global), 'extensions', EXTENSION_NAME),
        sandboxImplementationDir,
      ],
      settingsPaths: Object.values(settingsPaths),
    }
  }

  const sessionAllowedDomains = new Set<string>()
  const sessionAllowedReadPaths = new Set<string>()
  const sessionAllowedWritePaths = new Set<string>()

  function buildRuntimeConfig(config: SandboxConfig, cwd: string): SandboxConfig {
    return buildRuntimeConfigWithSessionGrants(
      config,
      {
        domains: sessionAllowedDomains,
        readPaths: sessionAllowedReadPaths,
        writePaths: sessionAllowedWritePaths,
      },
      { cwd, protectedRoots: protectedRoots(cwd) },
    )
  }

  const runtimeLifecycle = createSandboxRuntimeLifecycle<
    { config: SandboxConfig; cwd: string },
    ReturnType<typeof createBashTool>
  >({
    reset: () => SandboxManager.reset(),
    async initialize({ config, cwd }) {
      const runtimeConfig = buildRuntimeConfig(config, cwd)
      const configExt = runtimeConfig as unknown as {
        ignoreViolations?: Record<string, string[]>
        enableWeakerNestedSandbox?: boolean
      }

      await SandboxManager.initialize({
        network: runtimeConfig.network,
        filesystem: runtimeConfig.filesystem,
        ignoreViolations: configExt.ignoreViolations,
        enableWeakerNestedSandbox: configExt.enableWeakerNestedSandbox,
      })

      return createBashTool(localCwd, { operations: createSandboxedBashOps() })
    },
  })

  const approvalBroker = createApprovalBroker({
    ask: askPermission,
    getSettingsPaths: (cwd) => getExtensionSettingsPaths(EXTENSION_NAME, cwd),
    refreshRuntime: async (cwd) => {
      await runtimeLifecycle.refresh({ config: loadConfig(cwd), cwd })
    },
    createGuard: () => runtimeLifecycle.createGuard(),
  })

  type GateOutcome =
    | { status: 'allowed'; executor: ReturnType<typeof createBashTool> }
    | { status: 'blocked'; reason: string }

  /**
   * Runs an approval prompt and re-checks runtime availability afterwards: the
   * runtime can be torn down or refreshed while the prompt is open.
   */
  async function gateApproval(
    approval: Promise<boolean>,
    denyReason: string,
  ): Promise<GateOutcome> {
    let allowed: boolean
    try {
      allowed = await approval
    } catch (error) {
      if (runtimeLifecycle.access().kind === 'sandboxed') throw error
      allowed = false
    }

    const access = runtimeLifecycle.access()
    if (access.kind !== 'sandboxed') {
      return { status: 'blocked', reason: RUNTIME_UNAVAILABLE_BLOCK_REASON }
    }
    if (!allowed) return { status: 'blocked', reason: denyReason }
    return { status: 'allowed', executor: access.executor }
  }

  async function promptForDomains(ctx: SandboxCtx, domains: string[]) {
    if (domains.length === 0) return true
    const config = loadConfig(ctx.cwd ?? localCwd)
    const blocked = domains.filter(
      (domain) => !isDomainAllowed(config, sessionAllowedDomains, domain),
    )
    if (blocked.length === 0) return true

    const prompt = `Sandbox blocked network domain${blocked.length === 1 ? '' : 's'}: ${blocked.join(', ')}`

    return approvalBroker.request({
      ctx,
      prompt,
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
    const sessionSet = access === 'read' ? sessionAllowedReadPaths : sessionAllowedWritePaths
    const allowKey = access === 'read' ? ALLOW_READ_KEY : ALLOW_WRITE_KEY
    const decision = decideFilesystemAccess({
      path: rawPath,
      access,
      cwd,
      filesystem: config.filesystem,
      sessionPaths: sessionSet,
      protectedRoots: protectedRoots(cwd),
    })

    if (decision.status === 'denied') {
      const message = decision.reason === 'protected-sandbox-path'
        ? `Sandbox hard-blocked write to protected sandbox path: ${rawPath}`
        : `Sandbox hard-blocked write to ${rawPath} because it matches denyWrite`
      ctx.ui.notify(message, 'error')
      return false
    }
    if (decision.status === 'allowed') return true

    const prompt = `Sandbox blocked ${access} path: ${rawPath}`

    return approvalBroker.request({
      ctx,
      prompt,
      cwd,
      values: [decision.grantPath],
      sessionSet,
      persist: (target, values) => updateFilesystemAllowList(target, allowKey, values),
      successMessage: (target) => `Sandbox allowed ${access} ${decision.grantPath} in ${target}`,
    })
  }

  pi.registerTool({
    ...localBash,
    label: 'bash (sandboxed)',
    async execute(id, params, signal, onUpdate, ctx) {
      const initialAccess = runtimeLifecycle.access()
      if (initialAccess.kind === 'local') {
        return localBash.execute(id, params, signal, onUpdate)
      }
      if (initialAccess.kind === 'blocked') {
        return {
          content: [{ type: 'text', text: initialAccess.reason }],
          isError: true,
        }
      }

      const command = typeof params.command === 'string' ? params.command : ''
      const gated = await gateApproval(
        promptForDomains(ctx, extractCommandDomains(command)),
        NETWORK_BLOCK_REASON,
      )
      if (gated.status === 'blocked') {
        return { content: [{ type: 'text', text: gated.reason }], isError: true }
      }

      return gated.executor.execute(id, params, signal, onUpdate)
    },
  })

  pi.on('user_bash', async (event, ctx) => {
    const initialAccess = runtimeLifecycle.access()
    if (initialAccess.kind === 'local') return
    if (initialAccess.kind === 'blocked') return blockedBashResult(initialAccess.reason)

    const gated = await gateApproval(
      promptForDomains(ctx, extractCommandDomains(event.command)),
      NETWORK_BLOCK_REASON,
    )
    if (gated.status === 'blocked') return blockedBashResult(gated.reason)
    return { operations: createSandboxedBashOps() }
  })

  pi.on('tool_call', async (event, ctx) => {
    const initialAccess = runtimeLifecycle.access()
    if (initialAccess.kind === 'local') return
    if (initialAccess.kind === 'blocked') {
      return { block: true, reason: initialAccess.reason }
    }

    let pending: { approval: Promise<boolean>; denyReason: string } | undefined

    if (WEB_FETCH_TOOLS.has(event.toolName)) {
      pending = {
        approval: promptForDomains(ctx, extractFetchDomains(event.input)),
        denyReason: NETWORK_BLOCK_REASON,
      }
    } else {
      const access = PATH_TOOL_ACCESS[event.toolName]
      const targetPath = access ? extractToolPath(event.input) : undefined
      if (access && targetPath) {
        pending = {
          approval: promptForPath(ctx, targetPath, access),
          denyReason: FILESYSTEM_BLOCK_REASON,
        }
      }
    }

    if (!pending) return

    const gated = await gateApproval(pending.approval, pending.denyReason)
    if (gated.status === 'blocked') return { block: true, reason: gated.reason }
  })

  pi.on('session_start', async (_event, ctx) => {
    const noSandbox = pi.getFlag(NO_SANDBOX_FLAG) as boolean

    if (noSandbox) {
      disableSandbox(ctx, 'Sandbox disabled via --no-sandbox', 'warning', true)
      return
    }

    const config = loadConfig(ctx.cwd)

    if (!config.enabled) {
      disableSandbox(ctx, 'Sandbox disabled via config', 'info', true)
      return
    }

    const platform = process.platform
    if (platform !== 'darwin' && platform !== 'linux') {
      disableSandbox(ctx, `Sandbox not supported on ${platform}`, 'warning', true)
      return
    }

    try {
      await runtimeLifecycle.initialize({ config, cwd: ctx.cwd })

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
      clearSandboxStatus(ctx)
      if (runtimeLifecycle.state !== 'disabled') {
        ctx.ui.notify(
          `Sandbox initialization failed: ${err instanceof Error ? err.message : err}`,
          'error',
        )
      }
    }
  })

  pi.on('session_shutdown', async (_event, ctx) => {
    try {
      await runtimeLifecycle.shutdown()
    } catch {
      // Ignore cleanup errors
    }
    clearSandboxStatus(ctx)
  })

  pi.registerCommand(EXTENSION_NAME, {
    description: 'Show sandbox configuration',
    handler: async (_args, ctx) => {
      if (runtimeLifecycle.state === 'disabled') {
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
