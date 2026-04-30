/**
 * Permission Extension
 *
 * Controls tool execution via settings files:
 *   ~/<agent-dir>/permission.settings.json             (global)
 *   <repo-root>/.agents/permission.settings.json       (project, committed)
 *   <repo-root>/.agents/permission.settings.local.json (project, gitignored)
 *
 * Schema:
 * {
 *   "defaultMode": "ask" | "allow" | "deny",
 *   "allow": ["toolPattern", "tool(argPattern)", ...],
 *   "deny":  ["toolPattern", "tool(argPattern)", ...],
 *   "ask":   ["toolPattern", "tool(argPattern)", ...]
 * }
 *
 * Trusted local skills (global + project) may also contribute runtime allow rules
 * via SKILL frontmatter: allowed_tools / allowed-tools.
 *
 * Rule format:
 *   "read"                — blanket match on tool name
 *   "mcp__playwright__*"  — glob match on tool name
 *   "bash(git *)"         — match tool "bash" where command matches "git *"
 *   "edit(/tmp/*)"        — match tool "edit" where path matches "/tmp/*"
 *
 * Evaluation order: deny > ask > allow > defaultMode (default: "ask")
 *
 * Argument matching depends on the tool:
 *   bash  — matched against command string
 *   edit/write/read — matched against file path
 *   grep/find/ls — matched against path argument
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  parseFrontmatter,
  type ExtensionAPI,
  type ExtensionContext,
} from '@mariozechner/pi-coding-agent'

import {
  getExtensionSettingsPaths,
  loadExtensionSettings,
} from '../__lib/extension-settings.ts'
import { showScrollableApproval } from './approval-ui.ts'
import {
  formatEditPrompt,
  formatWritePrompt,
  getEditPreview,
  getWritePreview,
  resolvePreviewContentForWidth,
  type MutationPreview,
} from './file-preview.ts'
import {
  getMatchValue,
  resolveMode,
  resolveModeWithTrace,
  type Mode,
  type PermissionTrace,
} from './rules.ts'

const EXTENSION = 'permission'
const CMUX_SOCKET = process.env.CMUX_SOCKET_PATH

interface PermissionSettings {
  defaultMode?: Mode
  allow?: string[]
  deny?: string[]
  ask?: string[]
  diffRenderer?: 'delta' | 'shiki'
  shikiTheme?: string
  keybindings?: {
    autoAcceptEdits?: string
  }
}

interface SkillCommandInfo {
  name: string
  source: 'skill'
  sourceInfo?: {
    scope?: 'user' | 'project' | 'temporary'
    path?: string
  }
}

interface SkillAllowSource {
  skill: string
  location: string
  path: string
  rules: string[]
}

interface DerivedSkillAllowState {
  cacheKey: string
  rules: string[]
  sources: SkillAllowSource[]
}

// Runtime mode overrides (toggled by user during session, not persisted)
const SessionModeOverrides = new Map<string, Mode>()
const SessionAllowRules = new Set<string>()

const STATUS_REJECTED = '[rejected]'

const LOCAL_SKILL_LOCATIONS = new Set(['user', 'project'])
let cachedDerivedSkillAllowState: DerivedSkillAllowState | undefined

export default function (pi: ExtensionAPI) {
  const initSettings = loadSettings(process.cwd())
  const keybindings = initSettings.keybindings ?? {}

  if (keybindings.autoAcceptEdits) {
    pi.registerShortcut(keybindings.autoAcceptEdits as any, {
      description: 'Toggle auto-accept edits',
      handler: toggleAutoAcceptEdits,
    })
  }

  pi.registerCommand('permission-toggle-auto-accept', {
    description: 'Toggle auto-accept edits',
    handler: async (_args, ctx) => toggleAutoAcceptEdits(ctx),
  })

  pi.registerCommand('permission-mode', {
    description: 'Set permission mode for a tool in the current session',
    handler: async (_args, ctx) => {
      const tool = await ctx.ui.input('Tool name', 'e.g. bash, edit')
      if (!tool) return
      const mode = await ctx.ui.select('Mode', ['allow', 'ask', 'deny'])
      if (!mode) return
      SessionModeOverrides.set(tool, mode as Mode)
      ctx.ui.notify(
        `Permission mode for "${tool}" set to "${mode}" (current session only)`,
        'info',
      )
    },
  })

  pi.registerCommand('permission-settings', {
    description: 'Show resolved permission settings',
    handler: async (_args, ctx) => {
      const derivedSkillAllowState = getDerivedSkillAllowState(pi)
      const settings = mergeSkillAllowRules(
        loadSettings(ctx.cwd),
        derivedSkillAllowState.rules,
      )
      const overrides = Object.fromEntries(SessionModeOverrides)
      const paths = getExtensionSettingsPaths(EXTENSION, ctx.cwd)
      const output = JSON.stringify(
        {
          settingsPaths: Object.fromEntries(
            Object.entries(paths).map(([scope, filePath]) => [
              scope,
              {
                path: filePath,
                exists: fs.existsSync(filePath),
              },
            ]),
          ),
          settings,
          derivedSkillAllowRules: derivedSkillAllowState.rules,
          skillRuleSources: derivedSkillAllowState.sources,
          sessionOverrides: overrides,
          sessionAllowRules: [...SessionAllowRules],
        },
        null,
        2,
      )
      await ctx.ui.editor('Resolved permission settings', output)
    },
  })

  pi.registerCommand('permission-explain', {
    description: 'Explain permission decision for a tool call',
    handler: async (_args, ctx) => {
      const tool = await ctx.ui.input('Tool name', 'e.g. bash, edit, read')
      if (!tool) return
      const arg = await ctx.ui.input('Argument to match', 'command, path, or URL')
      if (arg === undefined) return

      const derivedSkillAllowState = getDerivedSkillAllowState(pi)
      const settings = mergeSkillAllowRules(
        loadSettings(ctx.cwd),
        derivedSkillAllowState.rules,
      )
      const trace = resolveModeWithTrace(settings, tool, arg, {
        cwd: ctx.cwd,
        sessionModeOverrides: SessionModeOverrides,
        sessionAllowRules: SessionAllowRules,
      })
      const output = JSON.stringify(
        {
          tool,
          argument: arg,
          decision: trace,
          source: explainTraceSource(trace, ctx.cwd, derivedSkillAllowState),
        },
        null,
        2,
      )
      await ctx.ui.editor('Permission explanation', output)
    },
  })

  pi.on('tool_call', async (event, ctx) => {
    const derivedSkillAllowState = getDerivedSkillAllowState(pi)
    const settings = mergeSkillAllowRules(
      loadSettings(ctx.cwd),
      derivedSkillAllowState.rules,
    )
    const argValue = getMatchValue(
      event.toolName,
      event.input as Record<string, unknown>,
    )
    const mode = resolveMode(settings, event.toolName, argValue ?? '', {
      cwd: ctx.cwd,
      sessionModeOverrides: SessionModeOverrides,
      sessionAllowRules: SessionAllowRules,
    })

    switch (mode) {
      case 'allow': {
        return undefined
      }

      case 'deny': {
        ctx.abort()
        return {
          block: true,
          reason: `${STATUS_REJECTED} Denied by permission settings (${event.toolName})`,
        }
      }

      case 'ask': {
        if (!ctx.hasUI) {
          return {
            block: true,
            reason: `${STATUS_REJECTED} Blocked (no UI for confirmation): ${event.toolName}`,
          }
        }

        return await promptToolPermission(
          pi,
          ctx,
          event.toolName,
          argValue,
          event.input as Record<string, unknown>,
          settings,
        )
      }
    }
  })
}

function mergePermissions(
  base: Partial<PermissionSettings>,
  override: Partial<PermissionSettings>,
): Partial<PermissionSettings> {
  return {
    defaultMode: override.defaultMode ?? base.defaultMode,
    allow: [...(base.allow ?? []), ...(override.allow ?? [])],
    deny: [...(base.deny ?? []), ...(override.deny ?? [])],
    ask: [...(base.ask ?? []), ...(override.ask ?? [])],
    diffRenderer: override.diffRenderer ?? base.diffRenderer,
    shikiTheme: override.shikiTheme ?? base.shikiTheme,
    keybindings: { ...base.keybindings, ...override.keybindings },
  }
}

function loadSettings(cwd: string) {
  return loadExtensionSettings<PermissionSettings>(
    EXTENSION,
    cwd,
    mergePermissions,
  )
}

function explainTraceSource(
  trace: PermissionTrace,
  cwd: string,
  derivedSkillAllowState: DerivedSkillAllowState,
) {
  if (trace.reason === 'sessionOverride') return { scope: 'sessionOverride' }
  if (trace.reason === 'sessionAllow') return { scope: 'sessionAllow' }
  if (trace.reason === 'defaultMode') return findDefaultModeSource(cwd)
  if (!trace.rule) return undefined

  const settingKey = trace.reason === 'deny' || trace.reason === 'ask' || trace.reason === 'allow'
    ? trace.reason
    : undefined
  if (!settingKey) return undefined

  const settingsSource = findRuleSource(cwd, settingKey, trace.rule)
  if (settingsSource) return settingsSource

  const skillSource = derivedSkillAllowState.sources.find((source) =>
    source.rules.includes(trace.rule!),
  )
  if (skillSource) return { scope: 'skill', ...skillSource }

  return undefined
}

function findRuleSource(cwd: string, key: 'allow' | 'deny' | 'ask', rule: string) {
  const paths = getExtensionSettingsPaths(EXTENSION, cwd)
  for (const [scope, filePath] of Object.entries(paths)) {
    const settings = readSettingsFile(filePath)
    if (settings?.[key]?.includes(rule)) return { scope, path: filePath, key }
  }
  return undefined
}

function findDefaultModeSource(cwd: string) {
  const paths = getExtensionSettingsPaths(EXTENSION, cwd)
  let source: { scope: string; path: string; key: string; value: Mode } | undefined
  for (const [scope, filePath] of Object.entries(paths)) {
    const settings = readSettingsFile(filePath)
    if (settings?.defaultMode) {
      source = { scope, path: filePath, key: 'defaultMode', value: settings.defaultMode }
    }
  }
  return source
}

function readSettingsFile(filePath: string): Partial<PermissionSettings> | undefined {
  if (!fs.existsSync(filePath)) return undefined
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return undefined
  }
}

function toggleAutoAcceptEdits(ctx: ExtensionContext) {
  const editCurrent = SessionModeOverrides.get('edit')
  const writeCurrent = SessionModeOverrides.get('write')

  if (editCurrent === 'allow' && writeCurrent === 'allow') {
    SessionModeOverrides.delete('edit')
    SessionModeOverrides.delete('write')
    ctx.ui.setStatus('permission', undefined)
  } else {
    SessionModeOverrides.set('edit', 'allow')
    SessionModeOverrides.set('write', 'allow')
    ctx.ui.setStatus('permission', '▶︎ Auto-accept edits')
  }
}

type PermissionDecision = { block: true; reason: string } | undefined

async function promptToolPermission(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  toolName: string,
  argValue: string | undefined,
  input: Record<string, unknown>,
  settings: PermissionSettings,
): Promise<PermissionDecision> {
  notifyCmuxPermissionPrompt(pi, ctx, toolName)

  try {
    switch (toolName) {
      case 'read': {
        if (!argValue) return undefined
        return await promptReadPermission(ctx, argValue)
      }
      case 'edit':
      case 'write': {
        if (!argValue) return undefined
        return await promptFileMutationPermission(
          ctx,
          toolName,
          argValue,
          input,
          settings,
        )
      }
      case 'bash': {
        return await promptBashPermission(ctx, argValue)
      }
      default: {
        return await promptDefaultPermission(ctx, toolName, argValue, input)
      }
    }
  } finally {
    clearCmuxPermissionPrompt(pi, ctx)
  }
}

async function promptReadPermission(
  ctx: ExtensionContext,
  targetPath: string,
): Promise<PermissionDecision> {
  const choice = await ctx.ui.select(
    formatToolPrompt('read', targetPath),
    getPermissionChoices('read'),
  )

  if (isChoiceApproved(choice, 'read', targetPath, ctx)) {
    return undefined
  }

  return rejectToolCall(
    ctx,
    `${STATUS_REJECTED} User rejected the read to ${targetPath}. File unchanged.`,
  )
}

async function promptFileMutationPermission(
  ctx: ExtensionContext,
  toolName: 'edit' | 'write',
  targetPath: string,
  input: Record<string, unknown>,
  settings: PermissionSettings,
): Promise<PermissionDecision> {
  const previewOptions = {
    diffRenderer: settings.diffRenderer,
    shikiTheme: settings.shikiTheme,
  }
  const preview =
    toolName === 'write'
      ? await getWritePreview(targetPath, input, ctx.cwd, previewOptions)
      : await getEditPreview(targetPath, input, ctx.cwd, previewOptions)

  const unsafeWarning = getUnsafeFileMutationWarning(toolName, preview)
  if (unsafeWarning) {
    return {
      block: true,
      reason: `${STATUS_REJECTED} ${unsafeWarning} Please read the latest file contents and retry with updated edit blocks. File unchanged.`,
    }
  }

  const choice = await showFileMutationApproval(
    ctx,
    toolName,
    targetPath,
    input,
    preview,
  )
  if (isChoiceApproved(choice, toolName, targetPath, ctx)) {
    return undefined
  }

  return rejectToolCall(
    ctx,
    `${STATUS_REJECTED} User rejected the ${toolName} to ${targetPath}. File unchanged.`,
  )
}

async function promptBashPermission(
  ctx: ExtensionContext,
  command: string | undefined,
): Promise<PermissionDecision> {
  if (!command) {
    return { block: true, reason: 'No command provided' }
  }

  const choice = await ctx.ui.select(
    formatBashPrompt(command),
    getPermissionChoices('bash'),
  )
  if (isChoiceApproved(choice, 'bash', command, ctx)) {
    return undefined
  }

  return rejectToolCall(ctx, `${STATUS_REJECTED} Rejected by user`)
}

async function promptDefaultPermission(
  ctx: ExtensionContext,
  toolName: string,
  argValue: string | undefined,
  input: Record<string, unknown>,
): Promise<PermissionDecision> {
  const message = argValue ?? JSON.stringify(input, null, 2)
  const allowed = await ctx.ui.confirm(toolName, message)
  if (allowed) return undefined

  return rejectToolCall(ctx, `${STATUS_REJECTED} Rejected by user`)
}

function isChoiceApproved(
  choice: string | null | undefined,
  toolName: 'read' | 'edit' | 'write' | 'bash',
  argValue: string,
  ctx: ExtensionContext,
): boolean {
  if (choice?.startsWith('Always allow')) {
    rememberSessionPermission(toolName, argValue, ctx.cwd, choice)
    ctx.ui.notify(`Remembered for session: ${choice}`, 'info')
    return true
  }

  return choice === 'Accept once'
}

function rejectToolCall(
  ctx: ExtensionContext,
  reason: string,
): { block: true; reason: string } {
  ctx.abort()
  return { block: true, reason }
}

function getUnsafeFileMutationWarning(
  toolName: 'edit' | 'write',
  preview: MutationPreview,
): string | undefined {
  if (toolName !== 'edit') return undefined

  return preview.warnings.find((warning) =>
    warning.includes('Target file not found') ||
    warning.includes('Could not read target file') ||
    warning.includes('oldText is empty') ||
    warning.includes('oldText was not found') ||
    warning.includes('oldText matched multiple locations') ||
    warning.includes('overlap the same region'),
  )
}

async function showFileMutationApproval(
  ctx: ExtensionContext,
  toolName: 'edit' | 'write',
  targetPath: string,
  input: Record<string, unknown>,
  preview: MutationPreview,
): Promise<string | null> {
  const previewCache = new Map<string, string | undefined>()
  const contentForWidth = (width: number) => {
    const resolvedPreview = resolvePreviewContentForWidth(
      preview,
      width,
      previewCache,
    )
    return toolName === 'write'
      ? formatWritePrompt(targetPath, input, preview, resolvedPreview)
      : formatEditPrompt(targetPath, input, preview, resolvedPreview)
  }

  const warningLabel =
    preview.warnings.length > 0 ? ` · warnings:${preview.warnings.length}` : ''

  return showScrollableApproval(
    ctx,
    toolName,
    contentForWidth,
    getPermissionChoices(toolName),
    `${targetPath} · preview:${preview.renderer}${warningLabel}`,
  )
}

function notifyCmuxPermissionPrompt(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  toolName: string,
) {
  if (!CMUX_SOCKET || !ctx.hasUI) return

  // Fire-and-forget notification so permission prompts can pull focus in cmux.
  pi.exec('cmux', ['notify', '--title', `Permission required: ${toolName}`], {
    timeout: 2000,
  }).catch(() => {})
}

function clearCmuxPermissionPrompt(pi: ExtensionAPI, ctx: ExtensionContext) {
  if (!CMUX_SOCKET || !ctx.hasUI) return

  // Clear queued notifications once a permission decision has been made.
  pi.exec('cmux', ['clear-notifications'], { timeout: 2000 }).catch(() => {})
}

function formatToolPrompt(
  toolName: 'read' | 'edit' | 'write',
  targetPath: string,
): string {
  if (toolName === 'read') return formatReadPrompt(targetPath)
  return ['Allow tool call?', `Tool: ${toolName}`, `Path: ${targetPath}`].join(
    '\n',
  )
}

function getPermissionChoices(
  toolName: 'read' | 'edit' | 'write' | 'bash',
): string[] {
  if (toolName === 'bash') {
    return [
      'Accept once',
      'Always allow this exact command for session',
      'Always allow all bash for session',
      'Reject',
    ]
  }

  return [
    'Accept once',
    'Always allow this path for session',
    'Always allow this directory for session',
    'Reject',
  ]
}

function rememberSessionPermission(
  toolName: 'read' | 'edit' | 'write' | 'bash',
  argValue: string,
  cwd: string,
  choice: string,
) {
  if (toolName === 'bash') {
    if (choice === 'Always allow all bash for session') {
      SessionAllowRules.add('bash')
      return
    }
    if (choice === 'Always allow this exact command for session') {
      SessionAllowRules.add(`bash(${argValue})`)
    }
    return
  }

  const resolvedPath = path.resolve(cwd, argValue)
  if (choice === 'Always allow this path for session') {
    SessionAllowRules.add(`${toolName}(${resolvedPath})`)
    return
  }
  if (choice === 'Always allow this directory for session') {
    SessionAllowRules.add(`${toolName}(${path.dirname(resolvedPath)}/*)`)
  }
}

function formatReadPrompt(targetPath: string): string {
  return ['Allow file read?', `Path: ${targetPath}`].join('\n')
}

function formatBashPrompt(command: string): string {
  return ['Allow shell command?', command].join('\n')
}

function parseRuleList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  return []
}

function getSkillAllowedRules(skillPath: string): string[] {
  try {
    const content = fs.readFileSync(skillPath, 'utf-8')
    const { frontmatter } = parseFrontmatter<Record<string, unknown>>(content)
    return [
      ...parseRuleList(frontmatter.allowed_tools),
      ...parseRuleList(frontmatter['allowed-tools']),
    ]
  } catch {
    return []
  }
}

function buildSkillAllowCacheKey(skills: SkillCommandInfo[]): string {
  return skills
    .map((skill) => {
      const skillPath = skill.sourceInfo?.path ?? ''
      let stamp = 'missing'

      if (skillPath) {
        try {
          const stat = fs.statSync(skillPath)
          stamp = `${stat.mtimeMs}:${stat.size}`
        } catch {
          stamp = 'missing'
        }
      }

      return `${skill.sourceInfo?.scope ?? ''}:${skillPath}:${stamp}`
    })
    .sort()
    .join('\n')
}

function getDerivedSkillAllowState(pi: ExtensionAPI): DerivedSkillAllowState {
  const skills = pi
    .getCommands()
    .filter(
      (command): command is SkillCommandInfo =>
        command.source === 'skill' &&
        LOCAL_SKILL_LOCATIONS.has(command.sourceInfo?.scope ?? '') &&
        typeof command.sourceInfo?.path === 'string',
    )
    .sort((a, b) =>
      (a.sourceInfo?.path ?? '').localeCompare(b.sourceInfo?.path ?? ''),
    )

  const cacheKey = buildSkillAllowCacheKey(skills)
  if (cachedDerivedSkillAllowState?.cacheKey === cacheKey) {
    return cachedDerivedSkillAllowState
  }

  const sources = skills
    .map((skill) => {
      const skillPath = skill.sourceInfo?.path ?? ''
      const rules = getSkillAllowedRules(skillPath)
      return {
        skill: skill.name.replace(/^skill:/, ''),
        location: skill.sourceInfo?.scope ?? '',
        path: skillPath,
        rules,
      }
    })
    .filter((skill) => skill.rules.length > 0)

  cachedDerivedSkillAllowState = {
    cacheKey,
    rules: [...new Set(sources.flatMap((skill) => skill.rules))],
    sources,
  }
  return cachedDerivedSkillAllowState
}

function mergeSkillAllowRules(
  settings: PermissionSettings,
  skillRules: string[],
): PermissionSettings {
  if (skillRules.length === 0) return settings

  return {
    ...settings,
    allow: [...new Set([...(settings.allow ?? []), ...skillRules])],
  }
}
