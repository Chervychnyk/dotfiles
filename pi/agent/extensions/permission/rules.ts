import * as path from 'node:path'

export type Mode = 'allow' | 'ask' | 'deny'

export interface PermissionRuleSettings {
  defaultMode?: Mode
  allow?: string[]
  deny?: string[]
  ask?: string[]
}

interface ParsedRule {
  toolPattern: string
  argPattern?: string
}

interface ResolveModeOptions {
  cwd?: string
  sessionModeOverrides?: Map<string, Mode>
  sessionAllowRules?: Iterable<string>
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
  argValues: string[],
): boolean {
  const candidates = argValues.length > 0 ? argValues : ['']

  return rules.some((rule) => {
    const parsed = parseRule(rule)
    if (!matchPattern(parsed.toolPattern, toolName)) return false
    if (parsed.argPattern) {
      const pattern = parsed.argPattern
      return candidates.some((candidate) => matchPattern(pattern, candidate))
    }
    return true
  })
}

export function getMatchValue(
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

function isPathBasedTool(toolName: string): boolean {
  return (
    toolName === 'read' ||
    toolName === 'edit' ||
    toolName === 'write' ||
    toolName === 'grep' ||
    toolName === 'find' ||
    toolName === 'ls'
  )
}

function getArgMatchCandidates(
  toolName: string,
  argValue: string,
  cwd?: string,
): string[] {
  const candidates = [argValue]

  if (!cwd || !argValue || !isPathBasedTool(toolName)) {
    return candidates
  }

  const resolved = path.resolve(cwd, argValue)
  if (!candidates.includes(resolved)) {
    candidates.push(resolved)
  }

  return candidates
}

function resolveSingleMode(
  settings: PermissionRuleSettings,
  toolName: string,
  argCandidates: string[],
  sessionModeOverrides: Map<string, Mode>,
  sessionAllowRules: string[],
): Mode {
  const override = sessionModeOverrides.get(toolName)
  if (override) return override

  if (matchesAnyRule(settings.deny ?? [], toolName, argCandidates)) return 'deny'
  if (matchesAnyRule(sessionAllowRules, toolName, argCandidates)) return 'allow'
  if (matchesAnyRule(settings.ask ?? [], toolName, argCandidates)) return 'ask'
  if (matchesAnyRule(settings.allow ?? [], toolName, argCandidates)) return 'allow'

  return settings.defaultMode ?? 'ask'
}

/**
 * Resolve the permission mode for a tool call.
 * For bash commands, splits on pipes/operators and checks every segment.
 * The strictest mode wins: deny > ask > allow.
 * As an extra safety layer, otherwise-allowed bash commands that contain
 * output redirection are escalated to "ask".
 */
export function resolveMode(
  settings: PermissionRuleSettings,
  toolName: string,
  argValue: string,
  options: ResolveModeOptions = {},
): Mode {
  const sessionModeOverrides = options.sessionModeOverrides ?? new Map<string, Mode>()
  const sessionAllowRules = options.sessionAllowRules
    ? [...options.sessionAllowRules]
    : []

  if (toolName !== 'bash' || !argValue) {
    return resolveSingleMode(
      settings,
      toolName,
      getArgMatchCandidates(toolName, argValue, options.cwd),
      sessionModeOverrides,
      sessionAllowRules,
    )
  }

  const normalized = options.cwd ? normalizeBashForPermission(argValue, options.cwd) : argValue
  const segments = splitShellCommand(normalized)
  let worst: Mode = 'allow'

  for (const segment of segments) {
    const mode = resolveSingleMode(
      settings,
      toolName,
      [segment],
      sessionModeOverrides,
      sessionAllowRules,
    )
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
