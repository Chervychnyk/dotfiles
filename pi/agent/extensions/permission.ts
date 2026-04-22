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

import * as cp from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  parseFrontmatter,
  type ExtensionAPI,
  type ExtensionContext,
} from '@mariozechner/pi-coding-agent'
import { Key, matchesKey, truncateToWidth } from '@mariozechner/pi-tui'

import { loadExtensionSettings } from './__lib/extension-settings.ts'

const EXTENSION = 'permission'

type Mode = 'allow' | 'ask' | 'deny'

interface PermissionSettings {
  defaultMode?: Mode
  allow?: string[]
  deny?: string[]
  ask?: string[]
  keybindings?: {
    autoAcceptEdits?: string
  }
}

interface ParsedRule {
  toolPattern: string
  argPattern?: string
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
      const output = JSON.stringify(
        {
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
    const mode = resolveMode(settings, event.toolName, argValue ?? '', ctx.cwd)

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

        switch (event.toolName) {
          case 'read': {
            if (!argValue) break

            const choice = await ctx.ui.select(
              formatToolPrompt(
                event.toolName,
                argValue,
                event.input as Record<string, unknown>,
              ),
              getPermissionChoices(event.toolName),
            )

            if (choice?.startsWith('Always allow')) {
              rememberSessionPermission(event.toolName, argValue, ctx.cwd, choice)
              ctx.ui.notify(`Remembered for session: ${choice}`, 'info')
              return undefined
            }
            if (choice === 'Accept once') {
              return undefined
            }
            ctx.abort()
            return {
              block: true,
              reason: `${STATUS_REJECTED} User rejected the ${event.toolName} to ${argValue}. File unchanged.`,
            }
          }
          case 'edit':
          case 'write': {
            if (!argValue) break

            const choice = await showFileMutationApproval(
              ctx,
              event.toolName,
              argValue,
              event.input as Record<string, unknown>,
            )

            if (choice?.startsWith('Always allow')) {
              rememberSessionPermission(event.toolName, argValue, ctx.cwd, choice)
              ctx.ui.notify(`Remembered for session: ${choice}`, 'info')
              return undefined
            }
            if (choice === 'Accept once') {
              return undefined
            }
            ctx.abort()
            return {
              block: true,
              reason: `${STATUS_REJECTED} User rejected the ${event.toolName} to ${argValue}. File unchanged.`,
            }
          }
          case 'bash': {
            if (!argValue) return { block: true, reason: 'No command provided' }
            const choice = await ctx.ui.select(
              formatBashPrompt(argValue),
              getPermissionChoices('bash'),
            )
            if (choice?.startsWith('Always allow')) {
              rememberSessionPermission('bash', argValue, ctx.cwd, choice)
              ctx.ui.notify(`Remembered for session: ${choice}`, 'info')
              return undefined
            }
            if (choice === 'Accept once') {
              return undefined
            }
            ctx.abort()
            return {
              block: true,
              reason: `${STATUS_REJECTED} Rejected by user`,
            }
          }
          default: {
            const message = argValue ?? JSON.stringify(event.input, null, 2)
            const allowed = await ctx.ui.confirm(event.toolName, message)
            if (!allowed) {
              ctx.abort()
              return {
                block: true,
                reason: `${STATUS_REJECTED} Rejected by user`,
              }
            }
            return undefined
          }
        }
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

async function showFileMutationApproval(
  ctx: ExtensionContext,
  toolName: 'edit' | 'write',
  targetPath: string,
  input: Record<string, unknown>,
): Promise<string | null> {
  const preview = toolName === 'write'
    ? getWritePreview(targetPath, input)
    : getEditPreview(targetPath, input)
  const content = toolName === 'write'
    ? formatWritePrompt(targetPath, input, preview.content)
    : formatEditPrompt(targetPath, input, preview.content)
  return showScrollableApproval(
    ctx,
    toolName,
    content,
    getPermissionChoices(toolName),
    `${targetPath} · preview:${preview.renderer}`,
  )
}

async function showScrollableApproval(
  ctx: ExtensionContext,
  toolName: 'bash' | 'edit' | 'write',
  content: string,
  choices: string[],
  subject: string,
): Promise<string | null> {
  const lines = content.split('\n')

  return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    let scrollOffset = 0
    let actionIndex = 0

    function maxScroll(viewportHeight: number) {
      return Math.max(0, lines.length - viewportHeight)
    }

    function render(width: number): string[] {
      const safeWidth = Math.max(20, width)
      const innerWidth = Math.max(1, safeWidth)
      const viewportHeight = Math.max(
        6,
        Math.min(Math.ceil(lines.length), Math.floor((tui.height ?? 24) * 0.5)),
      )
      const visible = lines.slice(scrollOffset, scrollOffset + viewportHeight)
      const rendered: string[] = []
      const subjectLines = wrapPlainText(subject, innerWidth).slice(0, 2)
      const scrollLabel = `Lines ${scrollOffset + 1}-${Math.min(lines.length, scrollOffset + viewportHeight)} / ${lines.length}`
      const separator = theme.fg('accent', '─'.repeat(Math.max(8, safeWidth)))

      const pushRow = (text = '') => {
        rendered.push(truncateToWidth(text, innerWidth))
      }

      pushRow(theme.fg('accent', theme.bold(`${toolName.toUpperCase()} approval`)))
      for (const line of subjectLines) pushRow(theme.fg('muted', line))
      pushRow(theme.fg('dim', scrollLabel))
      pushRow(separator)
      for (const line of visible) pushRow(line)
      for (let i = visible.length; i < viewportHeight; i++) pushRow()
      pushRow(separator)
      pushRow(theme.fg('dim', '↑↓ scroll • PgUp/PgDn page • ←→ choose • Enter confirm • Esc cancel'))
      pushRow(renderActionBar(choices, actionIndex, theme, innerWidth))
      return rendered
    }

    return {
      render,
      invalidate() {},
      handleInput(data: string) {
        const viewportHeight = Math.max(
          6,
          Math.min(Math.ceil(lines.length), Math.floor((tui.height ?? 24) * 0.5)),
        )
        if (matchesKey(data, Key.up)) {
          scrollOffset = Math.max(0, scrollOffset - 1)
        } else if (matchesKey(data, Key.down)) {
          scrollOffset = Math.min(maxScroll(viewportHeight), scrollOffset + 1)
        } else if (matchesKey(data, Key.pageUp)) {
          scrollOffset = Math.max(0, scrollOffset - viewportHeight)
        } else if (matchesKey(data, Key.pageDown)) {
          scrollOffset = Math.min(maxScroll(viewportHeight), scrollOffset + viewportHeight)
        } else if (matchesKey(data, Key.left)) {
          actionIndex = (actionIndex - 1 + choices.length) % choices.length
        } else if (matchesKey(data, Key.right) || data === '\t') {
          actionIndex = (actionIndex + 1) % choices.length
        } else if (matchesKey(data, Key.enter)) {
          done(choices[actionIndex] ?? null)
          return
        } else if (matchesKey(data, Key.escape)) {
          done(null)
          return
        }
        tui.requestRender()
      },
    }
  })
}

function wrapPlainText(text: string, width: number): string[] {
  const maxWidth = Math.max(1, width)
  const out: string[] = []

  for (const rawLine of text.split('\n')) {
    if (!rawLine) {
      out.push('')
      continue
    }

    let remaining = rawLine
    while (remaining.length > maxWidth) {
      let splitAt = remaining.lastIndexOf(' ', maxWidth)
      if (splitAt <= 0) splitAt = maxWidth
      out.push(remaining.slice(0, splitAt).trimEnd())
      remaining = remaining.slice(splitAt).trimStart()
    }
    out.push(remaining)
  }

  return out
}

function renderActionBar(
  choices: string[],
  actionIndex: number,
  theme: any,
  width: number,
): string {
  const labels = choices.map((choice, index) => {
    const short = choice
      .replace('Always allow ', 'Allow ')
      .replace(' for session', '')
      .replace('this exact command', 'command')
      .replace('this directory', 'directory')
      .replace('this path', 'path')
      .replace('all bash', 'all bash')
    return index === actionIndex ? theme.fg('accent', `[${short}]`) : short
  })

  return truncateToWidth(labels.join('  '), width)
}

function formatToolPrompt(
  toolName: 'read' | 'edit' | 'write',
  targetPath: string,
  input: Record<string, unknown>,
): string {
  if (toolName === 'read') return formatReadPrompt(targetPath)
  return toolName === 'write'
    ? formatWritePrompt(targetPath, input)
    : formatEditPrompt(targetPath, input)
}

function getPermissionChoices(toolName: 'read' | 'edit' | 'write' | 'bash'): string[] {
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

function getWritePreview(
  targetPath: string,
  input: Record<string, unknown>,
): { renderer: 'bat' | 'fallback'; content: string } {
  const content = typeof input.content === 'string' ? input.content : ''
  const batPreview = previewWithBat(targetPath, content, 5000)
  if (batPreview) return { renderer: 'bat', content: batPreview }
  return { renderer: 'fallback', content: previewText(content, 5000) }
}

function formatWritePrompt(
  targetPath: string,
  input: Record<string, unknown>,
  preview: string,
): string {
  const content = typeof input.content === 'string' ? input.content : ''
  const lines = countLines(content)
  const bytes = Buffer.byteLength(content, 'utf8')

  return [
    'Allow file write?',
    `Path: ${targetPath}`,
    `Size: ${lines} lines, ${bytes} bytes`,
    'Content preview:',
    preview,
  ].join('\n')
}

function getEditPreview(
  targetPath: string,
  input: Record<string, unknown>,
): { renderer: 'delta' | 'fallback'; content: string } {
  const edits = Array.isArray(input.edits)
    ? input.edits.filter(
        (entry): entry is { oldText?: unknown; newText?: unknown } =>
          !!entry && typeof entry === 'object',
      )
    : []

  if (edits.length === 0) {
    return { renderer: 'fallback', content: 'No edit blocks provided.' }
  }

  const blocks = edits.map((edit) => {
    const oldText =
      typeof edit.oldText === 'string' ? edit.oldText : String(edit.oldText ?? '')
    const newText =
      typeof edit.newText === 'string' ? edit.newText : String(edit.newText ?? '')
    const deltaPreview = previewWithDelta(targetPath, oldText, newText, 5000)

    return {
      renderer: deltaPreview ? 'delta' as const : 'fallback' as const,
      content: deltaPreview ?? fallbackDiffPreview(oldText, newText, 5000),
    }
  })

  return {
    renderer: blocks.some((block) => block.renderer === 'delta') ? 'delta' : 'fallback',
    content: blocks.map((block) => block.content).join(`\n${'─'.repeat(48)}\n`),
  }
}

function formatEditPrompt(
  targetPath: string,
  input: Record<string, unknown>,
  preview: string,
): string {
  return [
    'Allow file edit?',
    `Path: ${targetPath}`,
    preview,
  ].join('\n\n')
}

function fallbackDiffPreview(
  oldText: string,
  newText: string,
  maxLines: number,
): string {
  const oldLines = oldText.replace(/\t/g, '  ').split('\n')
  const newLines = newText.replace(/\t/g, '  ').split('\n')
  const removed = oldLines.map(
    (line, index) => `-${String(index + 1).padStart(3, ' ')} | ${line}`,
  )
  const added = newLines.map(
    (line, index) => `+${String(index + 1).padStart(3, ' ')} | ${line}`,
  )
  const combined = [...removed, ...added]
  const clipped = combined.slice(0, maxLines)

  if (combined.length > maxLines) {
    clipped.push(`… ${combined.length - maxLines} more diff lines`)
  }

  return clipped.join('\n')
}

function previewWithBat(
  targetPath: string,
  content: string,
  maxLines: number,
): string | undefined {
  const bat = findCommand(['bat', 'batcat'])
  if (!bat) return undefined

  try {
    const output = cp.execFileSync(
      bat,
      ['--paging=never', '--style=plain', '--color=always', '--file-name', targetPath],
      { encoding: 'utf8', input: content, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    return clipRenderedLines(output, maxLines)
  } catch {
    return undefined
  }
}

function previewWithDelta(
  targetPath: string,
  oldText: string,
  newText: string,
  maxLines: number,
): string | undefined {
  const delta = findCommand(['delta'])
  if (!delta) return undefined

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-permission-'))
  const ext = path.extname(targetPath) || '.txt'
  const base = path.basename(targetPath, ext) || 'file'
  const oldPath = path.join(tmpDir, `${base}.before${ext}`)
  const newPath = path.join(tmpDir, `${base}.after${ext}`)

  try {
    fs.writeFileSync(oldPath, oldText, 'utf8')
    fs.writeFileSync(newPath, newText, 'utf8')
    const diff = runGitNoIndexDiff(oldPath, newPath)
    if (!diff.trim()) return undefined

    const rendered = cp.execFileSync(
      delta,
      ['--paging=never', '--file-style=omit', '--hunk-header-style=omit'],
      { encoding: 'utf8', input: diff, stdio: ['pipe', 'pipe', 'ignore'] },
    )
    return clipRenderedLines(rendered, maxLines)
  } catch {
    return undefined
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function runGitNoIndexDiff(oldPath: string, newPath: string): string {
  try {
    return cp.execFileSync(
      'git',
      ['diff', '--no-index', '--no-ext-diff', '--', oldPath, newPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string'
    ) {
      return error.stdout
    }
    return ''
  }
}

function clipRenderedLines(value: string, maxLines: number): string {
  const lines = value.split('\n')
  const clipped = lines.slice(0, maxLines)
  if (lines.length > maxLines) {
    clipped.push(`… ${lines.length - maxLines} more lines`)
  }
  return clipped.join('\n')
}

function findCommand(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    try {
      const resolved = cp.execFileSync('which', [candidate], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (resolved) return resolved
    } catch {
      continue
    }
  }
  return undefined
}

function previewText(value: string, maxLines: number): string {
  if (!value) return '(empty)'

  const lines = value.replace(/\t/g, '  ').split('\n')
  const clipped = lines.slice(0, maxLines)
  const numbered = clipped.map((line, index) => `${String(index + 1).padStart(3, ' ')} | ${line}`)

  if (lines.length > maxLines) {
    numbered.push(`… ${lines.length - maxLines} more lines`)
  }

  return numbered.join('\n')
}

function countLines(value: string): number {
  if (!value) return 0
  return value.split('\n').length
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

function parseRule(rule: string): ParsedRule {
  const match = rule.match(/^([^(]+)\((.+)\)$/)
  if (match) {
    return { toolPattern: match[1], argPattern: match[2] }
  }
  return { toolPattern: rule }
}

function matchPattern(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  // Make trailing " .*" optional so "cmd *" also matches bare "cmd"
  const adjusted = escaped.replace(/ \.\*$/, '( .*)?')
  return new RegExp(`^${adjusted}$`).test(value)
}

function matchesAnyRule(
  rules: string[],
  toolName: string,
  argValue: string,
): boolean {
  return rules.some((rule) => {
    const parsed = parseRule(rule)
    if (!matchPattern(parsed.toolPattern, toolName)) return false
    if (parsed.argPattern) return matchPattern(parsed.argPattern, argValue)
    return true
  })
}

function getMatchValue(
  tool: string,
  input: Record<string, unknown>,
): string | undefined {
  switch (tool) {
    case 'bash':
      return input.command as string | undefined
    case 'edit':
    case 'write':
    case 'read':
      return input.path as string | undefined
    case 'fetch':
      return input.url as string | undefined
    case 'grep':
    case 'find':
    case 'ls':
      return (input.path as string | undefined) ?? ''
    default:
      return undefined
  }
}

function resolveSingleMode(
  settings: PermissionSettings,
  toolName: string,
  argValue: string,
): Mode {
  const override = SessionModeOverrides.get(toolName)
  if (override) return override

  if (matchesAnyRule(settings.deny ?? [], toolName, argValue)) return 'deny'
  if (matchesAnyRule([...SessionAllowRules], toolName, argValue)) return 'allow'
  if (matchesAnyRule(settings.ask ?? [], toolName, argValue)) return 'ask'
  if (matchesAnyRule(settings.allow ?? [], toolName, argValue)) return 'allow'

  return settings.defaultMode ?? 'ask'
}

/**
 * Resolve the permission mode for a tool call.
 * For bash commands, splits on pipes/operators and checks every segment.
 * The strictest mode wins: deny > ask > allow.
 * As an extra safety layer, otherwise-allowed bash commands that contain
 * output redirection are escalated to "ask".
 */
function resolveMode(
  settings: PermissionSettings,
  toolName: string,
  argValue: string,
  cwd?: string,
): Mode {
  if (toolName !== 'bash' || !argValue) {
    return resolveSingleMode(settings, toolName, argValue)
  }

  const normalized = cwd ? normalizeBashForPermission(argValue, cwd) : argValue
  const segments = splitShellCommand(normalized)
  let worst: Mode = 'allow'

  for (const segment of segments) {
    const mode = resolveSingleMode(settings, toolName, segment)
    if (mode === 'deny') return 'deny'
    if (mode === 'ask') worst = 'ask'
  }

  if (worst === 'allow' && hasShellOutputRedirection(normalized)) {
    return 'ask'
  }

  return worst
}

function normalizeBashForPermission(command: string, cwd: string): string {
  const start = skipWhitespace(command, 0)
  if (!command.startsWith('cd', start)) return command

  const afterCd = start + 2
  if (afterCd < command.length && !/\s/.test(command[afterCd])) return command

  const dirStart = skipWhitespace(command, afterCd)
  const dirToken = readShellWord(command, dirStart)
  if (!dirToken?.word) return command

  const afterDir = skipWhitespace(command, dirToken.end)
  if (command.slice(afterDir, afterDir + 2) !== '&&') return command

  const rest = command.slice(afterDir + 2).trim()
  if (!rest) return command

  const currentDir = path.resolve(cwd)
  const targetDir = path.resolve(cwd, dirToken.word)

  return targetDir === currentDir ? rest : command
}

/**
 * Split a shell command on unquoted operators: |, ||, &&, ;
 * Respects single/double quotes and backslash escapes.
 */
function splitShellCommand(command: string): string[] {
  const segments: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\' && !inSingle) {
      escaped = true
      current += char
      continue
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      current += char
      continue
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      current += char
      continue
    }

    if (!inSingle && !inDouble) {
      if (char === '|' && command[i + 1] === '|') {
        segments.push(current)
        current = ''
        i++
        continue
      }
      if (char === '&' && command[i + 1] === '&') {
        segments.push(current)
        current = ''
        i++
        continue
      }
      if (char === ';') {
        segments.push(current)
        current = ''
        continue
      }
      if (char === '|') {
        segments.push(current)
        current = ''
        continue
      }
    }

    current += char
  }

  if (current.trim()) {
    segments.push(current)
  }

  return segments.map((s) => s.trim()).filter((s) => s.length > 0)
}

/**
 * Detect unquoted shell output redirections.
 * Escalates otherwise-allowed bash commands to "ask" for an extra confirmation.
 * Redirections to /dev/null are exempt.
 */
function hasShellOutputRedirection(command: string): boolean {
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && !inSingle) {
      escaped = true
      continue
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }

    if (inSingle || inDouble) continue

    if (char === '&' && command[i + 1] === '>') {
      return true
    }

    if (char !== '>') continue

    // Ignore fd duplication/closing like 2>&1, >&2, >&-
    if (command[i + 1] === '&') continue
    // Ignore process substitution like >(...)
    if (command[i + 1] === '(') continue
    // Ignore redirection to /dev/null (e.g. >/dev/null, 2>/dev/null, >>/dev/null)
    {
      let j = i + 1
      if (j < command.length && command[j] === '>') j++ // skip >> second >
      while (j < command.length && command[j] === ' ') j++ // skip whitespace
      if (command.startsWith('/dev/null', j)) continue
    }

    return true
  }

  return false
}

function skipWhitespace(command: string, index: number): number {
  while (index < command.length && /\s/.test(command[index])) index++
  return index
}

function readShellWord(
  command: string,
  start: number,
): { word: string; end: number } | undefined {
  if (start >= command.length) return undefined

  const first = command[start]
  if (first === '"' || first === "'") {
    const quote = first
    let value = ''
    let escaped = false

    for (let i = start + 1; i < command.length; i++) {
      const char = command[i]
      if (escaped) {
        value += char
        escaped = false
        continue
      }
      if (char === '\\' && quote === '"') {
        escaped = true
        continue
      }
      if (char === quote) {
        return { word: value, end: i + 1 }
      }
      value += char
    }

    return undefined
  }

  let value = ''
  let escaped = false

  for (let i = start; i < command.length; i++) {
    const char = command[i]
    if (escaped) {
      value += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (/\s/.test(char) || char === '&' || char === '|' || char === ';') {
      return value ? { word: value, end: i } : undefined
    }
    value += char
  }

  return value ? { word: value, end: command.length } : undefined
}
