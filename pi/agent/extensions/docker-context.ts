import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from '@mariozechner/pi-coding-agent'
import { Type } from 'typebox'
import { Text } from '@mariozechner/pi-tui'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

type DockerContextState = {
  composeDir?: string
  composeCommand?: 'docker compose' | 'docker-compose'
  services: string[]
  runningServices?: string[]
  runningServicesKnown?: boolean
  defaultService?: string
  detected: boolean
  reason?: string
}

type PersistedState = {
  preferredService?: string
}

type PendingCommand = {
  service: string
  command: string
}

type QueueEntry = {
  promise: Promise<void>
  resolve: () => void
  position: number
}

type StreamCommandError = Error & {
  stdout?: string
  stderr?: string
  code?: number
}

const STATE_TYPE = 'docker-context-state'
const COMPOSE_FILES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yml',
  'docker-compose.yaml',
]
const DEFAULT_SERVICE_CANDIDATES = [
  'web',
  'app',
  'backend',
  'api',
  'server',
  'rails',
  'django',
]
const MAX_DOCKER_EXEC_QUEUE_PER_SERVICE = 3 // waiting commands, excluding the currently running one

function uniq(values: string[]): string[] {
  return [...new Set(values)]
}

function inferDefaultService(
  services: string[],
  preferredService?: string,
): string | undefined {
  if (preferredService && services.includes(preferredService))
    return preferredService

  for (const candidate of DEFAULT_SERVICE_CANDIDATES) {
    if (services.includes(candidate)) return candidate
  }

  const nonInfra = services.find(
    (service) =>
      !/(db|postgres|mysql|redis|memcached|elasticsearch|opensearch|kafka|zookeeper|rabbitmq|mailhog|traefik|nginx|caddy)/i.test(
        service,
      ),
  )

  return nonInfra ?? services[0]
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}

async function findComposeDir(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir)

  while (true) {
    for (const file of COMPOSE_FILES) {
      if (await fileExists(path.join(current, file))) return current
    }

    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

async function execInDir(
  pi: ExtensionAPI,
  cwd: string,
  args: string[],
  timeout = 20_000,
) {
  return pi.exec(args[0]!, args.slice(1), { cwd, timeout })
}

function truncateForPreview(text: string, maxLines = 20): string {
  const lines = text.split(/\r?\n/)
  if (lines.length <= maxLines) return text
  return `${lines.slice(0, maxLines).join('\n')}\n... ${lines.length - maxLines} more lines`
}

function attachStreamErrorDetails(
  error: Error,
  details: { stdout: string; stderr: string; code: number },
): StreamCommandError {
  const enriched = error as StreamCommandError
  enriched.stdout = details.stdout
  enriched.stderr = details.stderr
  enriched.code = details.code
  return enriched
}

function getStreamErrorDetails(error: unknown): {
  message: string
  timedOut: boolean
  stdout: string
  stderr: string
  exitCode: number
} {
  const streamError = error as StreamCommandError | undefined
  return {
    message: String(streamError?.message || 'Command failed'),
    timedOut: /timed out/i.test(String(streamError?.message || '')),
    stdout: String(streamError?.stdout ?? ''),
    stderr: String(streamError?.stderr ?? ''),
    exitCode: Number.isFinite(streamError?.code)
      ? Number(streamError?.code)
      : 124,
  }
}

function inferDockerExecTimeoutSeconds(command: string): number {
  if (/\b(bundle exec rspec|rspec|pytest|bin\/rails test|rails test)\b/.test(command)) {
    return 120
  }

  return 300
}

function renderExecHeader(
  theme: any,
  options: {
    isPartial: boolean
    queued?: boolean
    queuePosition?: number
    timedOut?: boolean
    mode: string
    service: string
    command: string
    exitCode?: number
  },
): string {
  const {
    isPartial,
    queued,
    queuePosition,
    timedOut,
    mode,
    service,
    command,
    exitCode,
  } = options

  if (isPartial) {
    if (queued) {
      return theme.fg(
        'warning',
        `queued ${mode} [${service}]${queuePosition ? ` #${queuePosition}` : ''} ${command}`,
      )
    }

    return theme.fg('warning', `running ${mode} [${service}] ${command}`)
  }

  if (timedOut) {
    return theme.fg('warning', `timed out ${mode} [${service}] exit ${exitCode ?? 124}`)
  }

  if (exitCode === 0) {
    return theme.fg('success', `done ${mode} [${service}] exit 0`)
  }

  return theme.fg('error', `failed ${mode} [${service}] exit ${exitCode ?? '?'}`)
}

function renderLogsHeader(
  theme: any,
  options: {
    isPartial: boolean
    timedOut?: boolean
    follow: boolean
    service: string
    exitCode?: number
  },
): string {
  const { isPartial, timedOut, follow, service, exitCode } = options

  if (isPartial) {
    return theme.fg('warning', `streaming logs [${service}]${follow ? ' follow' : ''}`)
  }

  if (timedOut) {
    return theme.fg('warning', `logs timed out [${service}] exit ${exitCode ?? 124}`)
  }

  if (exitCode === 0) {
    return theme.fg('success', `logs complete [${service}] exit 0`)
  }

  return theme.fg('error', `logs failed [${service}] exit ${exitCode ?? '?'}`)
}

async function streamCommandInDir(
  cwd: string,
  args: string[],
  signal?: AbortSignal,
  onUpdate?: (update: {
    content: Array<{ type: 'text'; text: string }>
    details?: Record<string, unknown>
  }) => void,
  timeoutMs?: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  // Use spawn here instead of pi.exec because docker_exec/docker_logs need
  // incremental stdout/stderr updates while the command is still running.
  // Run the process in its own group so aborts can tear down the full tree.
  return new Promise((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    let stdout = ''
    let stderr = ''
    let lastUpdateAt = 0
    let settled = false
    let timedOut = false
    let forceKillTimer: NodeJS.Timeout | undefined
    let timeoutTimer: NodeJS.Timeout | undefined

    const emitUpdate = (force = false) => {
      const now = Date.now()
      if (!force && now - lastUpdateAt < 250) return
      lastUpdateAt = now
      const chunks = []
      if (stdout.trim())
        chunks.push(`stdout:\n${truncateForPreview(stdout.trimEnd())}`)
      if (stderr.trim())
        chunks.push(`stderr:\n${truncateForPreview(stderr.trimEnd())}`)
      onUpdate?.({
        content: [{ type: 'text', text: chunks.join('\n\n') || 'Running...' }],
        details: { stdout, stderr, streaming: true },
      })
    }

    const killProcessGroup = (signalName: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signalName)
        else child.kill(signalName)
      } catch {
        try {
          child.kill(signalName)
        } catch {}
      }
    }

    const clearForceKillTimer = () => {
      if (!forceKillTimer) return
      clearTimeout(forceKillTimer)
      forceKillTimer = undefined
    }

    const clearTimeoutTimer = () => {
      if (!timeoutTimer) return
      clearTimeout(timeoutTimer)
      timeoutTimer = undefined
    }

    const scheduleForceKill = () => {
      clearForceKillTimer()
      forceKillTimer = setTimeout(() => {
        killProcessGroup('SIGKILL')
      }, 1000)
      forceKillTimer.unref()
    }

    const abort = () => {
      if (settled) return
      killProcessGroup('SIGTERM')
      scheduleForceKill()
    }

    const cleanup = () => {
      clearForceKillTimer()
      clearTimeoutTimer()
      signal?.removeEventListener('abort', abort)
    }

    if (timeoutMs && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (settled) return
        timedOut = true
        abort()
      }, timeoutMs)
      timeoutTimer.unref()
    }

    if (signal) {
      if (signal.aborted) abort()
      signal.addEventListener('abort', abort, { once: true })
    }

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString()
      emitUpdate()
    })

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
      emitUpdate()
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      cleanup()
      emitUpdate(true)

      if (timedOut) {
        reject(
          attachStreamErrorDetails(
            new Error(
              `Command timed out after ${Math.ceil((timeoutMs ?? 0) / 1000)}s`,
            ),
            {
              stdout,
              stderr,
              code: code ?? 124,
            },
          ),
        )
        return
      }

      resolve({ code: code ?? 0, stdout, stderr })
    })
  })
}

async function detectComposeCommand(
  pi: ExtensionAPI,
  composeDir: string,
): Promise<'docker compose' | 'docker-compose' | undefined> {
  const dockerCompose = await execInDir(pi, composeDir, [
    'docker',
    'compose',
    'version',
  ]).catch(() => null)
  if (dockerCompose && dockerCompose.code === 0) return 'docker compose'

  const legacy = await execInDir(pi, composeDir, [
    'docker-compose',
    'version',
  ]).catch(() => null)
  if (legacy && legacy.code === 0) return 'docker-compose'

  return undefined
}

async function listServices(
  pi: ExtensionAPI,
  composeDir: string,
  composeCommand: 'docker compose' | 'docker-compose',
): Promise<string[]> {
  const args =
    composeCommand === 'docker compose'
      ? ['docker', 'compose', 'config', '--services']
      : ['docker-compose', 'config', '--services']

  const result = await execInDir(pi, composeDir, args)
  if (result.code !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        'Failed to list Docker services',
    )
  }

  return uniq(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

async function listRunningServices(
  pi: ExtensionAPI,
  composeDir: string,
  composeCommand: 'docker compose' | 'docker-compose',
): Promise<{ services: string[]; known: boolean }> {
  const args =
    composeCommand === 'docker compose'
      ? ['docker', 'compose', 'ps', '--services', '--status', 'running']
      : ['docker-compose', 'ps', '--services', '--filter', 'status=running']

  const result = await execInDir(pi, composeDir, args)
  if (result.code !== 0) return { services: [], known: false }

  const services = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (composeCommand === 'docker compose')
    return { services: uniq(services), known: true }

  return {
    services: uniq(
      services.filter(
        (line) =>
          !/^name\s+/i.test(line) &&
          !/^(----|\s*$)/.test(line) &&
          !/\bExit\b|\bCreated\b/i.test(line),
      ),
    ),
    known: true,
  }
}

function getPersistedState(ctx: ExtensionContext): PersistedState {
  let state: PersistedState = {}
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === 'custom' && entry.customType === STATE_TYPE) {
      state = { ...(entry.data as PersistedState) }
    }
  }
  return state
}

function formatContext(state: DockerContextState): string {
  if (!state.detected) {
    return `Docker context unavailable${state.reason ? `: ${state.reason}` : ''}`
  }

  return [
    `compose dir: ${state.composeDir}`,
    `compose command: ${state.composeCommand}`,
    `services: ${state.services.join(', ') || '(none)'}`,
    `running services: ${state.runningServicesKnown ? state.runningServices?.join(', ') || '(none)' : '(unknown)'}`,
    `default service: ${state.defaultService ?? '(unset)'}`,
  ].join('\n')
}

function buildAgentGuidance(state: DockerContextState): string | undefined {
  if (!state.detected) return undefined

  const examples = [
    '`bin/rails ...`',
    '`bundle exec rspec ...`',
    '`pytest ...`',
    '`python manage.py ...`',
    '`npm test` / `pnpm test`',
  ].join(', ')

  return [
    'Docker Compose context is available for this project.',
    `Compose directory: ${state.composeDir}`,
    `Compose command: ${state.composeCommand}`,
    `Services: ${state.services.join(', ')}`,
    `Running services: ${state.runningServicesKnown ? state.runningServices?.join(', ') || '(none)' : '(unknown)'}`,
    `Default app service: ${state.defaultService ?? '(unset)'}`,
    'When backend commands should run inside the container, prefer the custom docker_exec tool over raw bash.',
    `Typical containerized commands include ${examples}.`,
    'Use docker_services if you need to confirm the available/default service first.',
    'Use raw bash for host-level tasks only, such as git operations, local file inspection, or docker compose status checks.',
  ].join('\n')
}

export default function dockerContextExtension(pi: ExtensionAPI) {
  let state: DockerContextState = {
    services: [],
    detected: false,
    reason: 'Not initialized yet',
  }
  const runningExecs = new Map<string, PendingCommand>()
  const execQueues = new Map<string, QueueEntry>()

  async function refresh(ctx: ExtensionContext): Promise<DockerContextState> {
    const persisted = getPersistedState(ctx)
    const composeDir = await findComposeDir(ctx.cwd)

    if (!composeDir) {
      state = {
        composeDir: undefined,
        composeCommand: undefined,
        services: [],
        runningServices: [],
        runningServicesKnown: false,
        defaultService: undefined,
        detected: false,
        reason: 'No Docker Compose file found from cwd upwards',
      }
      return state
    }

    const composeCommand = await detectComposeCommand(pi, composeDir)
    if (!composeCommand) {
      state = {
        composeDir,
        composeCommand: undefined,
        services: [],
        runningServices: [],
        runningServicesKnown: false,
        defaultService: undefined,
        detected: false,
        reason: 'Neither `docker compose` nor `docker-compose` is available',
      }
      return state
    }

    try {
      const services = await listServices(pi, composeDir, composeCommand)
      const running = await listRunningServices(pi, composeDir, composeCommand)
      state = {
        composeDir,
        composeCommand,
        services,
        runningServices: running.services,
        runningServicesKnown: running.known,
        defaultService: inferDefaultService(
          services,
          persisted.preferredService,
        ),
        detected: true,
      }
      return state
    } catch (error: any) {
      state = {
        composeDir,
        composeCommand,
        services: [],
        runningServices: [],
        runningServicesKnown: false,
        defaultService: undefined,
        detected: false,
        reason: error?.message || 'Failed to inspect Docker Compose services',
      }
      return state
    }
  }

  function requireDetectedState(): DockerContextState {
    if (!state.detected || !state.composeDir || !state.composeCommand) {
      throw new Error(
        state.reason || 'Docker context is not available in this project',
      )
    }
    return state
  }

  function getComposeExecSpec(
    command: string,
    service: string | undefined,
    workdir: string | undefined,
  ) {
    const current = requireDetectedState()
    const targetService = service || current.defaultService
    if (!targetService) {
      throw new Error(
        'No Docker service selected. Use /docker-context set <service>.',
      )
    }
    if (!current.services.includes(targetService)) {
      throw new Error(`Unknown Docker service: ${targetService}`)
    }

    const shellCommand = workdir
      ? `cd ${JSON.stringify(workdir)} && ${command}`
      : command

    const mode = current.runningServicesKnown
      ? current.runningServices?.includes(targetService)
        ? 'exec'
        : 'run'
      : 'run'

    const args =
      mode === 'exec'
        ? current.composeCommand === 'docker compose'
          ? [
              'docker',
              'compose',
              'exec',
              '-T',
              targetService,
              'sh',
              '-lc',
              shellCommand,
            ]
          : [
              'docker-compose',
              'exec',
              '-T',
              targetService,
              'sh',
              '-lc',
              shellCommand,
            ]
        : current.composeCommand === 'docker compose'
          ? [
              'docker',
              'compose',
              'run',
              '--rm',
              '-T',
              targetService,
              'sh',
              '-lc',
              shellCommand,
            ]
          : [
              'docker-compose',
              'run',
              '--rm',
              '-T',
              targetService,
              'sh',
              '-lc',
              shellCommand,
            ]

    return {
      composeDir: current.composeDir,
      service: targetService,
      mode,
      args,
    }
  }

  pi.on('session_start', async (_event, ctx) => {
    const next = await refresh(ctx)
    if (ctx.hasUI && next.detected) {
      ctx.ui.notify(
        `Docker context: ${next.defaultService ?? 'no default'} (${next.services.join(', ')})`,
        'info',
      )
    }
  })

  pi.on('before_agent_start', async (_event, ctx) => {
    await refresh(ctx)
    const guidance = buildAgentGuidance(state)
    if (!guidance) return

    return {
      message: {
        customType: 'docker-context',
        content: guidance,
        display: false,
      },
    }
  })

  pi.registerCommand('docker-context', {
    description:
      'Show or manage Docker Compose context. Usage: /docker-context [refresh|set <service>]',
    handler: async (args, ctx: ExtensionCommandContext) => {
      const trimmed = (args || '').trim()

      if (!trimmed || trimmed === 'show') {
        await refresh(ctx)
        ctx.ui.notify(formatContext(state), state.detected ? 'info' : 'warning')
        return
      }

      if (trimmed === 'refresh') {
        await refresh(ctx)
        ctx.ui.notify(
          formatContext(state),
          state.detected ? 'success' : 'warning',
        )
        return
      }

      if (trimmed.startsWith('set ')) {
        await refresh(ctx)
        const service = trimmed.slice(4).trim()
        if (!service) {
          ctx.ui.notify('Usage: /docker-context set <service>', 'warning')
          return
        }
        if (!state.services.includes(service)) {
          ctx.ui.notify(
            `Unknown service: ${service}. Known: ${state.services.join(', ')}`,
            'warning',
          )
          return
        }

        pi.appendEntry(STATE_TYPE, { preferredService: service })
        state.defaultService = service
        ctx.ui.notify(`Docker default service set to ${service}`, 'success')
        return
      }

      ctx.ui.notify('Usage: /docker-context [refresh|set <service>]', 'warning')
    },
    getArgumentCompletions: (prefix: string) => {
      const options = [
        'refresh',
        ...state.services.map((service) => `set ${service}`),
      ]
      const filtered = options.filter((option) => option.startsWith(prefix))
      return filtered.length > 0
        ? filtered.map((value) => ({ value, label: value }))
        : null
    },
  })

  pi.registerTool({
    name: 'docker_services',
    label: 'Docker Services',
    description:
      'Inspect Docker Compose services and default execution service for the current project.',
    promptSnippet: 'Inspect Docker Compose context for the current project',
    promptGuidelines: [
      'Use this tool before running backend commands when the project may use Docker Compose.',
      'Prefer docker_exec for Rails, Python, and Node commands that should run inside the app container.',
    ],
    parameters: Type.Object({
      refresh: Type.Optional(
        Type.Boolean({
          description: 'Refresh service detection before returning context',
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.refresh) await refresh(ctx)
      return {
        content: [{ type: 'text', text: formatContext(state) }],
        details: state,
      }
    },
  })

  pi.registerTool({
    name: 'docker_exec',
    label: 'Docker Exec',
    description:
      'Run a shell command inside a Docker Compose service using `docker compose exec -T`.',
    promptSnippet:
      'Run Rails, Python, or Node commands inside the correct Docker Compose service',
    promptGuidelines: [
      'Use this tool for backend project commands that should run inside containers, especially Rails-in-Docker workflows.',
      'If unsure which service to target, call docker_services first.',
      'Prefer targeted commands like `bundle exec rspec ...`, `bin/rails ...`, `pytest ...`, or `npm test ...` instead of broad shell sessions.',
    ],
    parameters: Type.Object({
      command: Type.String({
        description: 'Shell command to run inside the container',
      }),
      service: Type.Optional(
        Type.String({
          description:
            'Docker Compose service name. Defaults to detected default service.',
        }),
      ),
      workdir: Type.Optional(
        Type.String({
          description:
            'Working directory inside the container before running the command',
        }),
      ),
      timeout: Type.Optional(
        Type.Number({
          description:
            'Timeout in seconds before aborting the command. Defaults to 120 for rspec/pytest/test commands, otherwise 300.',
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      await refresh(ctx)
      const execSpec = getComposeExecSpec(
        params.command,
        params.service,
        params.workdir,
      )

      const timeoutSeconds = Number.isFinite(params.timeout)
        ? Math.max(1, Math.floor(params.timeout as number))
        : inferDockerExecTimeoutSeconds(params.command)
      const lockKey = execSpec.service
      const previous = execQueues.get(lockKey)
      let releaseQueue: (() => void) | undefined
      const queuePosition = previous ? previous.position + 1 : 1

      const queuedCount = Math.max(0, queuePosition - 1)

      if (queuedCount > MAX_DOCKER_EXEC_QUEUE_PER_SERVICE) {
        const active = runningExecs.get(lockKey)
        const summary = [
          `service: ${execSpec.service}`,
          'status: queue full',
          `max queued: ${MAX_DOCKER_EXEC_QUEUE_PER_SERVICE}`,
          `running command: ${active?.command ?? 'another docker_exec'}`,
          `rejected command: ${params.command}`,
        ].join('\n\n')

        return {
          content: [{ type: 'text', text: summary }],
          details: {
            ...state,
            service: execSpec.service,
            command: params.command,
            workdir: params.workdir,
            mode: execSpec.mode,
            composeArgs: execSpec.args,
            timeout: timeoutSeconds,
            queueFull: true,
            maxQueue: MAX_DOCKER_EXEC_QUEUE_PER_SERVICE,
            queuePosition,
            queuedCount,
            runningCommand: active?.command,
          },
        }
      }

      const queueEntry: QueueEntry = {
        promise: new Promise<void>((resolve) => {
          releaseQueue = resolve
        }),
        resolve: () => releaseQueue?.(),
        position: queuePosition,
      }
      execQueues.set(lockKey, queueEntry)

      if (previous) {
        const active = runningExecs.get(lockKey)
        onUpdate?.({
          content: [
            {
              type: 'text',
              text: `service: ${execSpec.service}\nstatus: queued\nqueue position: ${queuePosition}\nwaiting for: ${active?.command ?? 'another docker_exec'}\ncommand: ${params.command}\ntimeout: ${timeoutSeconds}s`,
            },
          ],
          details: {
            ...state,
            service: execSpec.service,
            command: params.command,
            workdir: params.workdir,
            mode: execSpec.mode,
            composeArgs: execSpec.args,
            timeout: timeoutSeconds,
            queued: true,
            queuePosition,
            runningCommand: active?.command,
          },
        })

        await previous.promise
      }

      runningExecs.set(lockKey, {
        service: execSpec.service,
        command: params.command,
      })

      onUpdate?.({
        content: [
          {
            type: 'text',
            text: `service: ${execSpec.service}\nmode: ${execSpec.mode}\ncommand: ${params.command}\ntimeout: ${timeoutSeconds}s`,
          },
        ],
        details: {
          ...state,
          service: execSpec.service,
          command: params.command,
          workdir: params.workdir,
          mode: execSpec.mode,
          composeArgs: execSpec.args,
          timeout: timeoutSeconds,
          streaming: true,
        },
      })

      const targetService = execSpec.service

      try {
        const result = await streamCommandInDir(
          execSpec.composeDir,
          execSpec.args,
          signal,
          onUpdate,
          timeoutSeconds * 1000,
        )
        const summary = [
          `service: ${targetService}`,
          `mode: ${execSpec.mode}`,
          `command: ${params.command}`,
          `timeout: ${timeoutSeconds}s`,
          `exit code: ${result.code}`,
          result.stdout?.trim()
            ? `stdout:\n${result.stdout.trim()}`
            : undefined,
          result.stderr?.trim()
            ? `stderr:\n${result.stderr.trim()}`
            : undefined,
        ]
          .filter(Boolean)
          .join('\n\n')

        return {
          content: [
            { type: 'text', text: summary || `service: ${targetService}` },
          ],
          details: {
            ...state,
            service: targetService,
            command: params.command,
            workdir: params.workdir,
            mode: execSpec.mode,
            composeArgs: execSpec.args,
            timeout: timeoutSeconds,
            exitCode: result.code,
            stdout: result.stdout,
            stderr: result.stderr,
          },
        }
      } catch (error: unknown) {
        const { message, timedOut, stdout, stderr, exitCode } =
          getStreamErrorDetails(error)
        const summary = [
          `service: ${targetService}`,
          `mode: ${execSpec.mode}`,
          `command: ${params.command}`,
          `timeout: ${timeoutSeconds}s`,
          timedOut ? 'status: timed out' : `error: ${message}`,
          `exit code: ${exitCode}`,
          stdout.trim() ? `stdout:\n${stdout.trim()}` : undefined,
          stderr.trim() ? `stderr:\n${stderr.trim()}` : undefined,
        ]
          .filter(Boolean)
          .join('\n\n')

        return {
          content: [
            { type: 'text', text: summary || `service: ${targetService}` },
          ],
          details: {
            ...state,
            service: targetService,
            command: params.command,
            workdir: params.workdir,
            mode: execSpec.mode,
            composeArgs: execSpec.args,
            timeout: timeoutSeconds,
            timedOut,
            exitCode,
            stdout,
            stderr,
          },
        }
      } finally {
        runningExecs.delete(lockKey)
        releaseQueue?.()
        if (execQueues.get(lockKey) === queueEntry) {
          execQueues.delete(lockKey)
        }
      }
    },
    renderCall(args, theme) {
      const service =
        (args.service as string | undefined) || state.defaultService || '?'
      let text = theme.fg('toolTitle', theme.bold('docker_exec '))
      text += theme.fg('accent', `[${service}] `)
      text += theme.fg('text', args.command as string)
      if (args.workdir) {
        text += theme.fg('dim', ` (cd ${args.workdir as string})`)
      }
      if (args.timeout) {
        text += theme.fg('dim', ` timeout=${args.timeout as number}s`)
      }
      return new Text(text, 0, 0)
    },
    renderResult(result, { expanded, isPartial }, theme) {
      const details = (result.details ?? {}) as Record<string, unknown>
      const service =
        (details.service as string | undefined) || state.defaultService || '?'
      const mode = (details.mode as string | undefined) || 'exec'
      const command = (details.command as string | undefined) || ''
      const stdout = String(details.stdout ?? '')
      const stderr = String(details.stderr ?? '')
      const exitCode = details.exitCode as number | undefined

      const timedOut = details.timedOut as boolean | undefined
      const queued = details.queued as boolean | undefined
      const queuePosition = details.queuePosition as number | undefined
      const runningCommand = details.runningCommand as string | undefined

      const header = renderExecHeader(theme, {
        isPartial,
        queued,
        queuePosition,
        timedOut,
        mode,
        service,
        command,
        exitCode,
      })

      const combined = [
        queued && queuePosition ? `queue position:\n${queuePosition}` : '',
        queued && runningCommand ? `waiting for:\n${runningCommand}` : '',
        stdout.trim() ? `stdout:\n${stdout.trimEnd()}` : '',
        stderr.trim() ? `stderr:\n${stderr.trimEnd()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')

      const body = expanded ? combined : truncateForPreview(combined || '', 12)
      return new Text(
        body ? `${header}\n${theme.fg('dim', body)}` : header,
        0,
        0,
      )
    },
  })

  pi.registerTool({
    name: 'docker_logs',
    label: 'Docker Logs',
    description:
      'Stream logs from a Docker Compose service, following live output by default.',
    promptSnippet: 'Inspect or stream logs from a Docker Compose service',
    promptGuidelines: [
      'Use this tool when debugging backend services running in Docker Compose.',
      'Prefer targeted log reads before broad shell commands when the issue may be visible in service logs.',
    ],
    parameters: Type.Object({
      service: Type.Optional(
        Type.String({
          description:
            'Docker Compose service name. Defaults to detected default service.',
        }),
      ),
      lines: Type.Optional(
        Type.Number({
          description:
            'How many recent log lines to show before following. Default 100.',
        }),
      ),
      follow: Type.Optional(
        Type.Boolean({
          description: 'Whether to follow logs live. Default true.',
        }),
      ),
      since: Type.Optional(
        Type.String({
          description:
            'Optional docker logs --since value, e.g. `10m`, `1h`, or RFC3339 timestamp.',
        }),
      ),
      timeout: Type.Optional(
        Type.Number({
          description:
            'Timeout in seconds before aborting log streaming. Unset by default.',
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      await refresh(ctx)
      const current = requireDetectedState()
      const service = params.service || current.defaultService
      if (!service) {
        throw new Error(
          'No Docker service selected. Use /docker-context set <service>.',
        )
      }
      if (!current.services.includes(service)) {
        throw new Error(`Unknown Docker service: ${service}`)
      }

      const lines = Number.isFinite(params.lines)
        ? Math.max(1, Math.floor(params.lines as number))
        : 100
      const follow = params.follow ?? true
      const args =
        current.composeCommand === 'docker compose'
          ? [
              'docker',
              'compose',
              'logs',
              '--tail',
              String(lines),
              ...(params.since ? ['--since', params.since] : []),
              ...(follow ? ['-f'] : []),
              service,
            ]
          : [
              'docker-compose',
              'logs',
              '--tail',
              String(lines),
              ...(params.since ? ['--since', params.since] : []),
              ...(follow ? ['-f'] : []),
              service,
            ]

      const timeoutSeconds = Number.isFinite(params.timeout)
        ? Math.max(1, Math.floor(params.timeout as number))
        : undefined

      onUpdate?.({
        content: [
          {
            type: 'text',
            text: `service: ${service}\nlines: ${lines}\nfollow: ${follow}${timeoutSeconds ? `\ntimeout: ${timeoutSeconds}s` : ''}`,
          },
        ],
        details: {
          ...state,
          service,
          lines,
          follow,
          since: params.since,
          composeArgs: args,
          timeout: timeoutSeconds,
          streaming: true,
        },
      })

      try {
        const result = await streamCommandInDir(
          current.composeDir!,
          args,
          signal,
          onUpdate,
          timeoutSeconds ? timeoutSeconds * 1000 : undefined,
        )
        const summary = [
          `service: ${service}`,
          `lines: ${lines}`,
          `follow: ${follow}`,
          params.since ? `since: ${params.since}` : undefined,
          timeoutSeconds ? `timeout: ${timeoutSeconds}s` : undefined,
          `exit code: ${result.code}`,
          result.stdout?.trim()
            ? `stdout:\n${result.stdout.trim()}`
            : undefined,
          result.stderr?.trim()
            ? `stderr:\n${result.stderr.trim()}`
            : undefined,
        ]
          .filter(Boolean)
          .join('\n\n')

        return {
          content: [{ type: 'text', text: summary || `service: ${service}` }],
          details: {
            ...state,
            service,
            lines,
            follow,
            since: params.since,
            composeArgs: args,
            timeout: timeoutSeconds,
            exitCode: result.code,
            stdout: result.stdout,
            stderr: result.stderr,
          },
        }
      } catch (error: unknown) {
        const { message, timedOut, stdout, stderr, exitCode } =
          getStreamErrorDetails(error)
        const summary = [
          `service: ${service}`,
          `lines: ${lines}`,
          `follow: ${follow}`,
          params.since ? `since: ${params.since}` : undefined,
          timeoutSeconds ? `timeout: ${timeoutSeconds}s` : undefined,
          timedOut ? 'status: timed out' : `error: ${message}`,
          `exit code: ${exitCode}`,
          stdout.trim() ? `stdout:\n${stdout.trim()}` : undefined,
          stderr.trim() ? `stderr:\n${stderr.trim()}` : undefined,
        ]
          .filter(Boolean)
          .join('\n\n')

        return {
          content: [{ type: 'text', text: summary || `service: ${service}` }],
          details: {
            ...state,
            service,
            lines,
            follow,
            since: params.since,
            composeArgs: args,
            timeout: timeoutSeconds,
            timedOut,
            exitCode,
            stdout,
            stderr,
          },
        }
      }
    },
    renderCall(args, theme) {
      const service =
        (args.service as string | undefined) || state.defaultService || '?'
      const lines = (args.lines as number | undefined) ?? 100
      const follow = (args.follow as boolean | undefined) ?? true
      let text = theme.fg('toolTitle', theme.bold('docker_logs '))
      text += theme.fg('accent', `[${service}]`)
      text += theme.fg('dim', ` tail=${lines}`)
      text += theme.fg('dim', follow ? ' follow' : ' once')
      if (args.since) text += theme.fg('dim', ` since=${args.since as string}`)
      if (args.timeout)
        text += theme.fg('dim', ` timeout=${args.timeout as number}s`)
      return new Text(text, 0, 0)
    },
    renderResult(result, { expanded, isPartial }, theme) {
      const details = (result.details ?? {}) as Record<string, unknown>
      const service =
        (details.service as string | undefined) || state.defaultService || '?'
      const stdout = String(details.stdout ?? '')
      const stderr = String(details.stderr ?? '')
      const exitCode = details.exitCode as number | undefined
      const follow = (details.follow as boolean | undefined) ?? true

      const timedOut = details.timedOut as boolean | undefined

      const header = renderLogsHeader(theme, {
        isPartial,
        timedOut,
        follow,
        service,
        exitCode,
      })

      const combined = [
        stdout.trim() ? stdout.trimEnd() : '',
        stderr.trim() ? `stderr:\n${stderr.trimEnd()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')

      const body = expanded ? combined : truncateForPreview(combined || '', 16)
      return new Text(
        body ? `${header}\n${theme.fg('dim', body)}` : header,
        0,
        0,
      )
    },
  })

  pi.on('tool_call', async (event, ctx) => {
    if (event.toolName !== 'bash') return

    await refresh(ctx)
    if (!state.detected) return

    const command = String(event.input.command ?? '')
    const likelyContainerCommand =
      /\b(bin\/rails|rails|bundle exec|rspec|rake|pytest|python manage\.py|npm (test|run|exec)|pnpm (test|run|exec)|yarn (test|run))\b/.test(
        command,
      )

    const alreadyDockerAware =
      /\bdocker(\s+compose)?\b|\bdocker-compose\b/.test(command)
    if (!likelyContainerCommand || alreadyDockerAware) return

    if (ctx.hasUI) {
      ctx.ui.notify(
        `Docker context detected: consider docker_exec for containerized command on ${state.defaultService ?? 'the app service'}`,
        'info',
      )
    }
  })
}
