/**
 * /context
 *
 * Small TUI view showing what's loaded/available:
 * - extensions (best-effort from registered extension slash commands)
 * - skills
 * - project context files (AGENTS.md / CLAUDE.md)
 * - current context window usage + session totals (tokens/cost)
 */

import type {
  CustomEntry,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  SessionEntry,
  SessionMessageEntry,
  ToolResultEvent,
} from '@earendil-works/pi-coding-agent'
import { DynamicBorder } from '@earendil-works/pi-coding-agent'
import {
  Container,
  Key,
  Text,
  matchesKey,
  type Component,
  type TUI,
} from '@earendil-works/pi-tui'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'

function formatUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.00'
  if (cost >= 1) return `$${cost.toFixed(2)}`
  if (cost >= 0.1) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(4)}`
}

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return Math.round(value).toLocaleString()
}

function formatTokens(value: number, exact = false): string {
  return `${exact ? '' : '~'}${compactNumber(value)} tok`
}

function plainUsageBar(used: number, total: number, width = 24): string {
  if (total <= 0) return ''
  const ratio = Math.min(1, Math.max(0, used / total))
  const filled = Math.min(width, Math.max(used > 0 ? 1 : 0, Math.round(ratio * width)))
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
}

function formatList(items: string[], empty = '(none)', max = 8): string {
  if (items.length === 0) return empty
  const head = items.slice(0, max)
  const rest = items.length - head.length
  return rest > 0 ? `${head.join(', ')} +${rest} more` : head.join(', ')
}

function estimateTokens(text: string, denominator = 4): number {
  // Deliberately fuzzy (good enough for “how big-ish is this”).
  return Math.max(0, Math.ceil(text.length / denominator))
}

type ModelSummary = {
  provider?: string
  id?: string
  api?: string
}

type TokenHeuristic = {
  label: string
  textDenominator: number
  toolDenominator: number
  toolShape: 'anthropic' | 'openai-chat' | 'openai-responses' | 'gemini' | 'bedrock' | 'raw'
}

function getTokenHeuristic(model?: ModelSummary): TokenHeuristic {
  const provider = (model?.provider ?? '').toLowerCase()
  const id = (model?.id ?? '').toLowerCase()
  const api = (model?.api ?? '').toLowerCase()

  if (provider.includes('anthropic') || api === 'anthropic-messages') {
    if (/claude.*4[-.]?[78]|4[-.]?[78].*claude/.test(id)) {
      return {
        label: 'Claude 4.7+ heuristic',
        textDenominator: 2.6,
        toolDenominator: 2.6,
        toolShape: 'anthropic',
      }
    }
    return {
      label: 'Anthropic heuristic',
      textDenominator: 3.5,
      toolDenominator: 3.3,
      toolShape: 'anthropic',
    }
  }

  if (
    provider.includes('openai') ||
    api === 'openai-responses' ||
    api === 'azure-openai-responses'
  ) {
    return {
      label: 'OpenAI Responses heuristic',
      textDenominator: 4,
      toolDenominator: 5.5,
      toolShape: 'openai-responses',
    }
  }

  if (
    api === 'openai-completions' ||
    api === 'mistral-conversations' ||
    provider.includes('mistral')
  ) {
    return {
      label: 'OpenAI chat-style heuristic',
      textDenominator: 4,
      toolDenominator: 5.5,
      toolShape: 'openai-chat',
    }
  }

  if (
    provider.includes('google') ||
    provider.includes('gemini') ||
    api === 'google-generative-ai' ||
    api === 'google-vertex'
  ) {
    return {
      label: 'Gemini/Vertex heuristic',
      textDenominator: 4,
      toolDenominator: 4,
      toolShape: 'gemini',
    }
  }

  if (provider.includes('bedrock') || api === 'bedrock-converse-stream') {
    return {
      label: 'Bedrock heuristic',
      textDenominator: 4,
      toolDenominator: 4,
      toolShape: 'bedrock',
    }
  }

  return {
    label: 'fallback chars/4',
    textDenominator: 4,
    toolDenominator: 4,
    toolShape: 'raw',
  }
}

function safeMinifiedJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'undefined'
  } catch (error) {
    return `[unserializable: ${error instanceof Error ? error.message : String(error)}]`
  }
}

type ToolLike = {
  name: string
  description?: string
  parameters?: unknown
  promptGuidelines?: string[]
}

function toolPayload(tool: ToolLike, shape: TokenHeuristic['toolShape']): unknown {
  const description = tool.description ?? ''
  switch (shape) {
    case 'anthropic':
      return {
        name: tool.name,
        description,
        input_schema: tool.parameters,
      }
    case 'openai-chat':
      return {
        type: 'function',
        function: {
          name: tool.name,
          description,
          parameters: tool.parameters,
          strict: null,
        },
      }
    case 'gemini':
      return {
        name: tool.name,
        description,
        parametersJsonSchema: tool.parameters,
      }
    case 'bedrock':
      return {
        toolSpec: {
          name: tool.name,
          description,
          inputSchema: { json: tool.parameters },
        },
      }
    case 'openai-responses':
      return {
        type: 'function',
        name: tool.name,
        description,
        parameters: tool.parameters,
        strict: null,
      }
    case 'raw':
      return {
        name: tool.name,
        description,
        parameters: tool.parameters,
        promptGuidelines: tool.promptGuidelines ?? [],
      }
    default:
      return {
        type: 'function',
        name: tool.name,
        description,
        parameters: tool.parameters,
        strict: null,
      }
  }
}

function estimateToolTokens(tool: ToolLike, heuristic: TokenHeuristic): number {
  return estimateTokens(
    safeMinifiedJson(toolPayload(tool, heuristic.toolShape)),
    heuristic.toolDenominator,
  )
}

function estimateToolsTokens(tools: ToolLike[], heuristic: TokenHeuristic): number {
  if (tools.length === 0) return 0
  const payload =
    heuristic.toolShape === 'gemini'
      ? {
          functionDeclarations: tools.map((tool) =>
            toolPayload(tool, heuristic.toolShape),
          ),
        }
      : tools.map((tool) => toolPayload(tool, heuristic.toolShape))
  return estimateTokens(safeMinifiedJson(payload), heuristic.toolDenominator)
}

function normalizeReadPath(inputPath: string, cwd: string): string {
  // Similar to pi's resolveToCwd/resolveReadPath, but simplified.
  let p = inputPath
  if (p.startsWith('@')) p = p.slice(1)
  if (p === '~') p = os.homedir()
  else if (p.startsWith('~/')) p = path.join(os.homedir(), p.slice(2))
  if (!path.isAbsolute(p)) p = path.resolve(cwd, p)
  return path.resolve(p)
}

function getAgentDir(): string {
  // Mirrors pi's behavior reasonably well.
  const envCandidates = ['PI_CODING_AGENT_DIR', 'TAU_CODING_AGENT_DIR']
  let envDir: string | undefined
  for (const k of envCandidates) {
    if (process.env[k]) {
      envDir = process.env[k]
      break
    }
  }
  if (!envDir) {
    for (const [k, v] of Object.entries(process.env)) {
      if (k.endsWith('_CODING_AGENT_DIR') && v) {
        envDir = v
        break
      }
    }
  }

  if (envDir) {
    if (envDir === '~') return os.homedir()
    if (envDir.startsWith('~/')) return path.join(os.homedir(), envDir.slice(2))
    return envDir
  }
  return path.join(os.homedir(), '.pi', 'agent')
}

async function readFileIfExists(
  filePath: string,
): Promise<{ path: string; content: string; bytes: number } | null> {
  if (!existsSync(filePath)) return null
  try {
    const buf = await fs.readFile(filePath)
    return {
      path: filePath,
      content: buf.toString('utf8'),
      bytes: buf.byteLength,
    }
  } catch {
    return null
  }
}

async function loadProjectContextFiles(
  cwd: string,
  denominator = 4,
): Promise<Array<{ path: string; tokens: number; bytes: number }>> {
  const out: Array<{ path: string; tokens: number; bytes: number }> = []
  const seen = new Set<string>()

  const loadFromDir = async (dir: string) => {
    for (const name of ['AGENTS.md', 'CLAUDE.md']) {
      const p = path.join(dir, name)
      const f = await readFileIfExists(p)
      if (f && !seen.has(f.path)) {
        seen.add(f.path)
        out.push({
          path: f.path,
          tokens: estimateTokens(f.content, denominator),
          bytes: f.bytes,
        })
        // pi loads at most one of those per dir
        return
      }
    }
  }

  await loadFromDir(getAgentDir())

  // Ancestors: root → cwd (same order as pi)
  const stack: string[] = []
  let current = path.resolve(cwd)
  while (true) {
    stack.push(current)
    const parent = path.resolve(current, '..')
    if (parent === current) break
    current = parent
  }
  stack.reverse()
  for (const dir of stack) await loadFromDir(dir)

  return out
}

function normalizeSkillName(name: string): string {
  return name.startsWith('skill:') ? name.slice('skill:'.length) : name
}

type SkillIndexEntry = {
  name: string
  skillFilePath: string
  skillDir: string
}

function buildSkillIndex(pi: ExtensionAPI, cwd: string): SkillIndexEntry[] {
  return pi
    .getCommands()
    .filter((c) => c.source === 'skill')
    .map((c) => {
      const p = c.sourceInfo?.path
        ? normalizeReadPath(c.sourceInfo.path, cwd)
        : ''
      return {
        name: normalizeSkillName(c.name),
        skillFilePath: p,
        skillDir: p ? path.dirname(p) : '',
      }
    })
    .filter((x) => x.name && x.skillDir)
}

const SKILL_LOADED_ENTRY = 'context:skill_loaded'
const TOOL_USED_ENTRY = 'context:tool_used'

type SkillLoadedEntryData = {
  name: string
  path: string
}

type ToolUsedEntryData = {
  name: string
}

function isCustomEntry<T = unknown>(
  entry: SessionEntry,
): entry is CustomEntry<T> {
  return entry.type === 'custom'
}

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
  return entry.type === 'message'
}

function getLoadedSkillsFromSession(ctx: ExtensionContext): Set<string> {
  const out = new Set<string>()
  for (const e of ctx.sessionManager.getEntries()) {
    if (!isCustomEntry<SkillLoadedEntryData>(e)) continue
    if (e.customType !== SKILL_LOADED_ENTRY) continue
    const data = e.data
    if (data?.name) out.add(data.name)
  }
  return out
}

function getUsedToolCountsFromSession(
  ctx: ExtensionContext | ExtensionCommandContext,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of ctx.sessionManager.getEntries()) {
    if (!isCustomEntry<ToolUsedEntryData>(e)) continue
    if (e.customType !== TOOL_USED_ENTRY) continue
    const data = e.data
    if (!data?.name) continue
    counts.set(data.name, (counts.get(data.name) ?? 0) + 1)
  }
  return counts
}

function formatUsedToolCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name} ${count}`)
    .join(', ')
}

function extractCostTotal(usage: any): number {
  if (!usage) return 0
  const c = usage?.cost
  if (typeof c === 'number') return Number.isFinite(c) ? c : 0
  if (typeof c === 'string') {
    const n = Number(c)
    return Number.isFinite(n) ? n : 0
  }
  const t = c?.total
  if (typeof t === 'number') return Number.isFinite(t) ? t : 0
  if (typeof t === 'string') {
    const n = Number(t)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function sumSessionUsage(ctx: ExtensionCommandContext): {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  totalCost: number
} {
  let input = 0
  let output = 0
  let cacheRead = 0
  let cacheWrite = 0
  let totalCost = 0

  for (const entry of ctx.sessionManager.getEntries()) {
    if (!isMessageEntry(entry)) continue
    const msg = entry.message
    if (msg.role !== 'assistant') continue
    const usage = msg.usage
    if (!usage) continue
    input += Number(usage.inputTokens ?? 0) || 0
    output += Number(usage.outputTokens ?? 0) || 0
    cacheRead += Number(usage.cacheRead ?? 0) || 0
    cacheWrite += Number(usage.cacheWrite ?? 0) || 0
    totalCost += extractCostTotal(usage)
  }

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    totalCost,
  }
}

function shortenPath(p: string, cwd: string): string {
  const rp = path.resolve(p)
  const rc = path.resolve(cwd)
  if (rp === rc) return '.'
  if (rp.startsWith(rc + path.sep)) return './' + rp.slice(rc.length + 1)
  return rp
}

function renderUsageBar(
  theme: any,
  parts: { system: number; tools: number; convo: number; remaining: number },
  total: number,
  width: number,
): string {
  const w = Math.max(10, width)
  if (total <= 0) return ''

  const toCols = (n: number) => Math.round((n / total) * w)
  let sys = toCols(parts.system)
  let tools = toCols(parts.tools)
  let con = toCols(parts.convo)
  let rem = w - sys - tools - con
  if (rem < 0) rem = 0
  // adjust rounding drift
  while (sys + tools + con + rem < w) rem++
  while (sys + tools + con + rem > w && rem > 0) rem--

  const block = '█'
  const sysStr = theme.fg('customMessageLabel', block.repeat(sys))
  const toolsStr = theme.fg('warning', block.repeat(tools))
  const conStr = theme.fg('accent', block.repeat(con))
  const remStr = theme.fg('dim', block.repeat(rem))
  return `${sysStr}${toolsStr}${conStr}${remStr}`
}

function joinComma(items: string[]): string {
  return items.join(', ')
}

function joinCommaStyled(
  items: string[],
  renderItem: (item: string) => string,
  sep: string,
): string {
  return items.map(renderItem).join(sep)
}

function padLabel(label: string, width = 30): string {
  if (label.length >= width) return `${label.slice(0, Math.max(0, width - 1))}…`
  return label.padEnd(width, ' ')
}

function singleLine(text: string, max = 96): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

type TokenDetail = {
  name: string
  tokens: number
  detail?: string
  active?: boolean
  loaded?: boolean
}

type ContextViewData = {
  usage: {
    // message-based context usage estimate from ctx.getContextUsage()
    messageTokens: number
    contextWindow: number
    // effective usage incl. a provider-shaped tool-definition estimate
    effectiveTokens: number
    percent: number
    remainingTokens: number
    systemPromptTokens: number
    agentTokens: number
    toolsTokens: number
    activeTools: number
    usedTools: number
    usedToolCalls: number
    usedToolSummary: string
    heuristicLabel: string
  } | null
  agentFiles: string[]
  extensions: string[]
  skills: string[]
  loadedSkills: string[]
  toolDetails: TokenDetail[]
  skillDetails: TokenDetail[]
  session: { totalTokens: number; totalCost: number }
}

class ContextView implements Component {
  private tui: TUI
  private theme: any
  private onDone: () => void
  private data: ContextViewData
  private container: Container
  private body: Text
  private cachedWidth?: number
  private expanded = false

  constructor(tui: TUI, theme: any, data: ContextViewData, onDone: () => void) {
    this.tui = tui
    this.theme = theme
    this.data = data
    this.onDone = onDone

    this.container = new Container()
    this.container.addChild(new DynamicBorder((s) => theme.fg('accent', s)))
    this.container.addChild(
      new Text(
        theme.fg('accent', theme.bold('Context')) +
          theme.fg('dim', '  (e/Ctrl+O expand · Esc/q/Enter close)'),
        1,
        0,
      ),
    )
    this.container.addChild(new Text('', 1, 0))

    this.body = new Text('', 1, 0)
    this.container.addChild(this.body)

    this.container.addChild(new Text('', 1, 0))
    this.container.addChild(new DynamicBorder((s) => theme.fg('accent', s)))
  }

  private rebuild(width: number): void {
    const muted = (s: string) => this.theme.fg('muted', s)
    const dim = (s: string) => this.theme.fg('dim', s)
    const text = (s: string) => this.theme.fg('text', s)
    const accent = (s: string) => this.theme.fg('accent', s)

    const labelWidth = Math.max(24, Math.min(34, width - 28))
    const row = (label: string, value: string, detail?: string, marker = true) =>
      `  ${marker ? accent('▸ ') : '  '}${muted(padLabel(label, labelWidth))}${accent(value)}${detail ? ` ${dim(detail)}` : ''}`

    const lines: string[] = []

    if (!this.data.usage) {
      lines.push(row('Total request', '(unknown)', undefined, false))
    } else {
      const u = this.data.usage
      lines.push(
        row(
          'Total request',
          formatTokens(u.effectiveTokens),
          `(${compactNumber(u.contextWindow)} ctx · ${u.percent.toFixed(1)}% used · ${formatTokens(u.remainingTokens)} left)`,
          false,
        ),
      )
      const barWidth = Math.max(12, Math.min(30, width - 36))
      const sysInMessages = Math.min(u.systemPromptTokens, u.messageTokens)
      const convoInMessages = Math.max(0, u.messageTokens - sysInMessages)
      const bar = renderUsageBar(
        this.theme,
        {
          system: sysInMessages,
          tools: u.toolsTokens,
          convo: convoInMessages,
          remaining: u.remainingTokens,
        },
        u.contextWindow,
        barWidth,
      )
      lines.push(
        `  ${bar}  ${dim(`harness ${formatTokens(u.systemPromptTokens + u.toolsTokens)} · session ${formatTokens(Math.max(0, u.messageTokens - u.systemPromptTokens))} · free ${formatTokens(u.remainingTokens)}`)}`,
      )
      lines.push(
        `  ${this.theme.fg('customMessageLabel', '█')} ${dim('system')}  ${this.theme.fg('warning', '█')} ${dim('tools')}  ${this.theme.fg('accent', '█')} ${dim('conversation')}  ${this.theme.fg('dim', '█')} ${dim('free')}`,
      )
    }

    lines.push('')
    if (this.data.usage) {
      const u = this.data.usage
      lines.push(row('Runtime system prompt', formatTokens(u.systemPromptTokens), `(AGENTS ${formatTokens(u.agentTokens)})`))
      lines.push(row(`Tools (${u.activeTools} active)`, formatTokens(u.toolsTokens), `(${u.heuristicLabel})`))
      lines.push(row(`AGENTS (${this.data.agentFiles.length})`, formatTokens(u.agentTokens), formatList(this.data.agentFiles)))
      lines.push(row(`Skills (${this.data.skills.length})`, `${this.data.skills.length}`, `${this.data.loadedSkills.length} loaded`))
      lines.push(row(`Extensions (${this.data.extensions.length})`, `${this.data.extensions.length}`, formatList(this.data.extensions)))
    }

    lines.push(
      row(
        'Total session',
        formatTokens(this.data.session.totalTokens, true),
        `(${formatUsd(this.data.session.totalCost)})`,
        false,
      ),
    )
    if (this.data.usage) {
      const u = this.data.usage
      lines.push(row('Tool calls', `${u.usedToolCalls}`, `${u.usedTools} unique · ${u.usedToolSummary || '(none)'}`, false))
    }

    const loaded = new Set(this.data.loadedSkills)
    if (this.expanded) {
      lines.push('', muted('Tool detail'))
      for (const tool of this.data.toolDetails) {
        lines.push(row(tool.name, formatTokens(tool.tokens), tool.detail, false))
      }
      if (this.data.toolDetails.length === 0) lines.push(dim('    (none)'))

      lines.push('', muted('Skill detail'))
      for (const skill of this.data.skillDetails) {
        const name = skill.loaded ? this.theme.fg('success', skill.name) : skill.name
        lines.push(row(name, formatTokens(skill.tokens), skill.detail, false))
      }
      if (this.data.skillDetails.length === 0) lines.push(dim('    (none)'))
    } else if (this.data.skills.length > 0) {
      const skillsRendered = joinCommaStyled(
        this.data.skills.slice(0, 10),
        (name) =>
          loaded.has(name)
            ? this.theme.fg('success', name)
            : this.theme.fg('muted', name),
        this.theme.fg('muted', ', '),
      )
      lines.push('', dim('  skills: ') + skillsRendered + (this.data.skills.length > 10 ? dim(` +${this.data.skills.length - 10} more`) : ''))
      lines.push(dim('  press e or Ctrl+O to expand tool/skill token details'))
    }

    this.body.setText(lines.join('\n'))
    this.cachedWidth = width
  }

  setExpanded(_expanded: boolean): void {
    this.expanded = !this.expanded
    this.invalidate()
  }

  handleInput(data: string): void {
    if (data.toLowerCase() === 'e' || matchesKey(data, Key.ctrl('o'))) {
      this.expanded = !this.expanded
      this.invalidate()
      return
    }
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl('c')) ||
      data.toLowerCase() === 'q' ||
      data === '\r'
    ) {
      this.onDone()
      return
    }
  }

  invalidate(): void {
    this.container.invalidate()
    this.cachedWidth = undefined
  }

  render(width: number): string[] {
    if (this.cachedWidth !== width) this.rebuild(width)
    return this.container.render(width)
  }
}

export default function contextExtension(pi: ExtensionAPI) {
  // Track which skills were actually pulled in via read tool calls.
  let lastSessionId: string | null = null
  let cachedLoadedSkills = new Set<string>()
  let cachedSkillIndex = new Array<SkillIndexEntry>()

  const ensureCaches = (ctx: ExtensionContext) => {
    const sid = ctx.sessionManager.getSessionId()
    if (sid !== lastSessionId) {
      lastSessionId = sid
      cachedLoadedSkills = getLoadedSkillsFromSession(ctx)
      cachedSkillIndex = buildSkillIndex(pi, ctx.cwd)
    }
    if (cachedSkillIndex.length === 0) {
      cachedSkillIndex = buildSkillIndex(pi, ctx.cwd)
    }
  }

  const matchSkillForPath = (absPath: string): string | null => {
    let best: SkillIndexEntry | null = null
    for (const s of cachedSkillIndex) {
      if (!s.skillDir) continue
      if (
        absPath === s.skillFilePath ||
        absPath.startsWith(s.skillDir + path.sep)
      ) {
        if (!best || s.skillDir.length > best.skillDir.length) best = s
      }
    }
    return best?.name ?? null
  }

  pi.on('tool_result', (event: ToolResultEvent, ctx: ExtensionContext) => {
    if ((event as any).isError) return

    const toolName =
      typeof (event as any).toolName === 'string' ? (event as any).toolName : ''
    if (toolName) {
      pi.appendEntry<ToolUsedEntryData>(TOOL_USED_ENTRY, {
        name: toolName,
      })
    }

    // Track loaded skills from successful read calls.
    if (toolName !== 'read') return

    const input = (event as any).input as { path?: unknown } | undefined
    const p = typeof input?.path === 'string' ? input.path : ''
    if (!p) return

    ensureCaches(ctx)
    const abs = normalizeReadPath(p, ctx.cwd)
    const skillName = matchSkillForPath(abs)
    if (!skillName) return

    if (!cachedLoadedSkills.has(skillName)) {
      cachedLoadedSkills.add(skillName)
      pi.appendEntry<SkillLoadedEntryData>(SKILL_LOADED_ENTRY, {
        name: skillName,
        path: abs,
      })
    }
  })

  pi.registerCommand('context', {
    description: 'Show loaded context overview',
    handler: async (_args, ctx: ExtensionCommandContext) => {
      const commands = pi.getCommands()
      const extensionCmds = commands.filter((c) => c.source === 'extension')
      const skillCmds = commands.filter((c) => c.source === 'skill')

      const extensionsByPath = new Map<string, string[]>()
      for (const c of extensionCmds) {
        const p = c.sourceInfo?.path ?? '<unknown>'
        const arr = extensionsByPath.get(p) ?? []
        arr.push(c.name)
        extensionsByPath.set(p, arr)
      }
      const extensionFiles = [...extensionsByPath.keys()]
        .map((p) => (p === '<unknown>' ? p : path.basename(p)))
        .sort((a, b) => a.localeCompare(b))

      const skills = skillCmds
        .map((c) => normalizeSkillName(c.name))
        .sort((a, b) => a.localeCompare(b))

      const systemPrompt = ctx.getSystemPrompt()
      const heuristic = getTokenHeuristic(ctx.model)

      const agentFiles = await loadProjectContextFiles(
        ctx.cwd,
        heuristic.textDenominator,
      )
      const agentFilePaths = agentFiles.map((f) => shortenPath(f.path, ctx.cwd))
      const agentTokens = agentFiles.reduce((a, f) => a + f.tokens, 0)
      const systemPromptTokens = systemPrompt
        ? estimateTokens(systemPrompt, heuristic.textDenominator)
        : 0

      const usage = ctx.getContextUsage()
      const messageTokens = usage?.tokens ?? 0
      const ctxWindow = usage?.contextWindow ?? 0

      // Tool definitions are not part of ctx.getContextUsage() (it estimates message tokens).
      // Estimate their impact from the provider-shaped payload, not just name/description.
      const activeToolNames = pi.getActiveTools()
      const toolInfoByName = new Map(
        pi.getAllTools().map((t) => [t.name, t] as const),
      )
      const activeToolInfos = activeToolNames
        .map((name) => toolInfoByName.get(name))
        .filter((tool): tool is NonNullable<typeof tool> => !!tool)
      const toolsTokens = estimateToolsTokens(activeToolInfos, heuristic)
      const toolDetails = activeToolInfos
        .map((tool) => ({
          name: tool.name,
          tokens: estimateToolTokens(tool, heuristic),
          detail: singleLine(tool.description || '(no description)'),
          active: true,
        }))
        .sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))

      const loadedSkillSet = getLoadedSkillsFromSession(ctx)
      const skillDetails = await Promise.all(
        skillCmds
          .filter((cmd) => loadedSkillSet.has(normalizeSkillName(cmd.name)))
          .map(async (cmd) => {
            const name = normalizeSkillName(cmd.name)
            const p = cmd.sourceInfo?.path
              ? normalizeReadPath(cmd.sourceInfo.path, ctx.cwd)
              : ''
            const file = p ? await readFileIfExists(p) : null
            return {
              name,
              tokens: file
                ? estimateTokens(file.content, heuristic.textDenominator)
                : 0,
              detail: p ? shortenPath(p, ctx.cwd) : undefined,
              loaded: true,
            }
          }),
      )
      skillDetails.sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))

      const effectiveTokens = messageTokens + toolsTokens
      const percent = ctxWindow > 0 ? (effectiveTokens / ctxWindow) * 100 : 0
      const remainingTokens =
        ctxWindow > 0 ? Math.max(0, ctxWindow - effectiveTokens) : 0

      const sessionUsage = sumSessionUsage(ctx)
      const usedToolCounts = getUsedToolCountsFromSession(ctx)
      const usedToolCalls = [...usedToolCounts.values()].reduce(
        (sum, count) => sum + count,
        0,
      )
      const usedToolSummary = formatUsedToolCounts(usedToolCounts)

      const makePlainText = () => {
        const lines: string[] = []
        lines.push('╭─ Context')
        if (usage) {
          lines.push(
            `│ ${plainUsageBar(effectiveTokens, ctxWindow)}  ${formatTokens(effectiveTokens)} / ${compactNumber(ctxWindow)} (${percent.toFixed(1)}%, ${formatTokens(remainingTokens)} left)`,
          )
        } else {
          lines.push('│ Window: unknown')
        }
        lines.push('├─ Budget')
        lines.push(
          `│ System     ${formatTokens(systemPromptTokens).padEnd(10)}  AGENTS ${formatTokens(agentTokens)}`,
        )
        lines.push(
          `│ Tool defs  ${formatTokens(toolsTokens).padEnd(10)}  ${activeToolNames.length} active · ${heuristic.label}`,
        )
        lines.push(
          `│ Session    ${formatTokens(sessionUsage.totalTokens, true).padEnd(10)}  ${formatUsd(sessionUsage.totalCost)}`,
        )
        lines.push('├─ Activity')
        lines.push(`│ Tools      ${usedToolCounts.size} used · ${usedToolCalls} calls`)
        lines.push(`│ Top tools  ${usedToolSummary || '(none)'}`)
        lines.push('├─ Loaded')
        lines.push(`│ AGENTS     ${formatList(agentFilePaths)}`)
        lines.push(
          `│ Extensions ${extensionFiles.length} · ${formatList(extensionFiles)}`,
        )
        lines.push(`│ Skills     ${skills.length} · ${formatList(skills)}`)
        lines.push('╰─')
        return lines.join('\n')
      }

      if (!ctx.hasUI) {
        pi.sendMessage(
          { customType: 'context', content: makePlainText(), display: true },
          { triggerTurn: false },
        )
        return
      }

      const loadedSkills = Array.from(loadedSkillSet).sort((a, b) =>
        a.localeCompare(b),
      )

      const viewData: ContextViewData = {
        usage: usage
          ? {
              messageTokens,
              contextWindow: ctxWindow,
              effectiveTokens,
              percent,
              remainingTokens,
              systemPromptTokens,
              agentTokens,
              toolsTokens,
              activeTools: activeToolNames.length,
              usedTools: usedToolCounts.size,
              usedToolCalls,
              usedToolSummary,
              heuristicLabel: heuristic.label,
            }
          : null,
        agentFiles: agentFilePaths,
        extensions: extensionFiles,
        skills,
        loadedSkills,
        toolDetails,
        skillDetails,
        session: {
          totalTokens: sessionUsage.totalTokens,
          totalCost: sessionUsage.totalCost,
        },
      }

      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        return new ContextView(tui, theme, viewData, done)
      })
    },
  })
}
