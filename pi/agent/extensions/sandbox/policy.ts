import path from 'node:path'

export function domainMatches(pattern: string, domain: string) {
  const normalizedPattern = pattern.toLowerCase()
  const normalizedDomain = domain.toLowerCase()
  if (normalizedPattern === '*') return true
  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2)
    return normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`)
  }
  return normalizedPattern === normalizedDomain
}

export function extractDomainsFromUrls(values: unknown[]) {
  const domains = new Set<string>()

  for (const value of values) {
    if (typeof value !== 'string') continue
    try {
      const parsed = new URL(value)
      if (parsed.hostname) domains.add(parsed.hostname.toLowerCase())
    } catch {}
  }

  return [...domains]
}

function addDomain(domains: Set<string>, value: string | undefined) {
  if (!value) return
  const normalized = value.toLowerCase().replace(/[),.;]+$/, '')
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(normalized)) return
  domains.add(normalized)
}

export function extractCommandDomains(command: string) {
  const domains = new Set<string>()
  const urls = command.match(/https?:\/\/[^\s'"<>`]+/g) ?? []
  for (const domain of extractDomainsFromUrls(urls)) domains.add(domain)

  for (const match of command.matchAll(/(?:^|\s)git@([a-zA-Z0-9.-]+):[^\s]+/g)) {
    addDomain(domains, match[1])
  }

  for (const match of command.matchAll(/(?:^|\s)ssh\s+(?:[^@\s]+@)?([a-zA-Z0-9.-]+)(?:\s|$)/g)) {
    addDomain(domains, match[1])
  }

  for (const match of command.matchAll(/(?:^|\s)(?:curl|wget)\s+(?:-[^\s]+\s+)*([a-zA-Z0-9.-]+)(?:[/:\s]|$)/g)) {
    addDomain(domains, match[1])
  }

  return [...domains]
}

export function expandHome(value: string) {
  return value === '~' || value.startsWith('~/')
    ? path.join(process.env.HOME ?? '', value.slice(2))
    : value
}

export function resolveSandboxPath(cwd: string, value: string) {
  const withoutAt = value.startsWith('@') ? value.slice(1) : value
  const expanded = expandHome(withoutAt)
  return path.resolve(cwd, expanded)
}

function globToRegExp(value: string) {
  let source = ''
  for (const char of value) {
    source += char === '*' ? '.*' : char.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

export function pathMatchesPattern(filePath: string, pattern: string, cwd: string) {
  const absolutePath = path.resolve(filePath)
  const absolutePattern = resolveSandboxPath(cwd, pattern)
  if (pattern.includes('*')) {
    return globToRegExp(absolutePattern).test(absolutePath)
  }
  return absolutePath === absolutePattern || absolutePath.startsWith(`${absolutePattern}${path.sep}`)
}

export function pathMatchesAny(filePath: string, patterns: string[] | undefined, cwd: string) {
  return (patterns ?? []).some((pattern) => pathMatchesPattern(filePath, pattern, cwd))
}

export function buildRuntimeConfigWithSessionGrants<Config extends {
  network?: { allowedDomains?: string[] }
  filesystem?: { allowRead?: string[]; allowWrite?: string[] }
}>(
  config: Config,
  grants: {
    domains?: Iterable<string>
    readPaths?: Iterable<string>
    writePaths?: Iterable<string>
  },
): Config {
  return {
    ...config,
    network: {
      ...config.network,
      allowedDomains: [
        ...(config.network?.allowedDomains ?? []),
        ...(grants.domains ?? []),
      ],
    },
    filesystem: {
      ...config.filesystem,
      allowRead: [
        ...(config.filesystem?.allowRead ?? []),
        ...(grants.readPaths ?? []),
      ],
      allowWrite: [
        ...(config.filesystem?.allowWrite ?? []),
        ...(grants.writePaths ?? []),
      ],
    },
  }
}

export const PERMISSION_CHOICES = [
  { key: 'a', value: 'abort', label: 'abort' },
  { key: 's', value: 'session', label: 'session' },
  { key: 'p', value: 'project', label: 'project' },
  { key: 'g', value: 'global', label: 'global' },
] as const

export type PermissionChoice = (typeof PERMISSION_CHOICES)[number]['value']

export function parsePermissionChoice(answer: string | undefined): PermissionChoice {
  const normalized = answer?.trim().toLowerCase()
  const key = normalized?.startsWith('[') ? normalized[1] : normalized?.[0]
  return PERMISSION_CHOICES.find((choice) => choice.key === key)?.value ?? 'abort'
}
