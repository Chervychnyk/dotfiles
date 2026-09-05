import fs from 'node:fs'
import os from 'node:os'
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

function expandHome(value: string) {
  return value === '~' || value.startsWith('~/')
    ? path.join(os.homedir(), value.slice(2))
    : value
}

function resolveSandboxPath(cwd: string, value: string) {
  const withoutAt = value.startsWith('@') ? value.slice(1) : value
  const expanded = expandHome(withoutAt)
  if (path.isAbsolute(expanded)) return expanded
  if (expanded === '.') return path.resolve(cwd)
  return `${path.resolve(cwd)}${path.sep}${expanded}`
}

function canonicalizeSandboxPath(filePath: string) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : `${path.resolve('.')}${path.sep}${filePath}`
  const { root } = path.parse(absolutePath)
  let pending = absolutePath.slice(root.length).split(path.sep).filter(Boolean)
  let resolved = root
  let followedLinkCount = 0

  while (pending.length > 0) {
    const component = pending.shift()!
    if (component === '.') continue
    if (component === '..') {
      resolved = path.dirname(resolved)
      continue
    }

    const candidate = path.join(resolved, component)
    let stat: fs.Stats
    try {
      stat = fs.lstatSync(candidate)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      resolved = candidate
      continue
    }

    if (!stat.isSymbolicLink()) {
      resolved = candidate
      continue
    }

    followedLinkCount += 1
    if (followedLinkCount > 40) {
      throw new Error(`Too many symlinks while resolving sandbox path: ${filePath}`)
    }

    const linkTarget = fs.readlinkSync(candidate)
    const targetParts = linkTarget.split(path.sep).filter(Boolean)
    if (path.isAbsolute(linkTarget)) {
      resolved = path.parse(linkTarget).root
    }
    pending = [...targetParts, ...pending]
  }

  return resolved
}

interface ProtectedSandboxRoots {
  sandboxDirs: string[]
  settingsPaths: string[]
}

function toggleFirstLetter(value: string) {
  const index = value.search(/[a-z]/i)
  if (index === -1) return undefined
  const letter = value[index]
  const toggled = letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()
  return `${value.slice(0, index)}${toggled}${value.slice(index + 1)}`
}

const caseInsensitiveFilesystemCache = new Map<string, boolean>()

function isCaseInsensitiveFilesystem(filePath: string) {
  const resolved = path.resolve(filePath)
  const cached = caseInsensitiveFilesystemCache.get(resolved)
  if (cached !== undefined) return cached
  const result = probeCaseInsensitiveFilesystem(resolved)
  caseInsensitiveFilesystemCache.set(resolved, result)
  return result
}

function probeCaseInsensitiveFilesystem(filePath: string) {
  let existing = path.resolve(filePath)
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) return false
    existing = parent
  }

  while (true) {
    const basename = path.basename(existing)
    const toggledBasename = toggleFirstLetter(basename)
    if (toggledBasename) {
      const alternate = path.join(path.dirname(existing), toggledBasename)
      try {
        const originalStat = fs.statSync(existing)
        const alternateStat = fs.statSync(alternate)
        return originalStat.dev === alternateStat.dev && originalStat.ino === alternateStat.ino
      } catch {}
    }

    const parent = path.dirname(existing)
    if (parent === existing) return false
    existing = parent
  }
}

function normalizePathForComparison(value: string, caseInsensitive: boolean) {
  return caseInsensitive ? value.toLowerCase() : value
}

function pathsEqual(target: string, expected: string) {
  const caseInsensitive = isCaseInsensitiveFilesystem(expected)
  return (
    normalizePathForComparison(target, caseInsensitive) ===
    normalizePathForComparison(expected, caseInsensitive)
  )
}

function pathIsEqualOrDescendant(
  target: string,
  expected: string,
  caseInsensitive = isCaseInsensitiveFilesystem(expected),
) {
  const normalizedTarget = normalizePathForComparison(target, caseInsensitive)
  const normalizedExpected = normalizePathForComparison(expected, caseInsensitive)
  return (
    normalizedTarget === normalizedExpected ||
    normalizedTarget.startsWith(`${normalizedExpected}${path.sep}`)
  )
}

type NormalizedTarget = {
  lexical: string
  canonical: string
}

function normalizeTargetIdentity(cwd: string, filePath: string): NormalizedTarget {
  const unresolved = resolveSandboxPath(cwd, filePath)
  return {
    lexical: path.resolve(unresolved),
    canonical: canonicalizeSandboxPath(unresolved),
  }
}

function rootIdentity(value: string): NormalizedTarget {
  const lexical = path.resolve(expandHome(value))
  return { lexical, canonical: canonicalizeSandboxPath(lexical) }
}

function isProtectedSandboxWrite(
  target: NormalizedTarget,
  roots: ProtectedSandboxRoots,
) {
  const { lexical: lexicalTarget, canonical: canonicalTarget } = target
  const protectedSandboxDirs = roots.sandboxDirs.map(rootIdentity)
  const protectedSettings = roots.settingsPaths.map(rootIdentity)

  return (
    protectedSandboxDirs.some(({ lexical, canonical }) =>
      pathIsEqualOrDescendant(lexicalTarget, lexical) ||
      pathIsEqualOrDescendant(canonicalTarget, canonical),
    ) ||
    protectedSettings.some(({ lexical, canonical }) =>
      pathsEqual(lexicalTarget, lexical) || pathsEqual(canonicalTarget, canonical),
    )
  )
}

function containsGlob(pattern: string) {
  return /[*?[\]]/.test(pattern)
}

function globToRegExp(value: string, caseInsensitive: boolean) {
  const source = value
    .replace(/[.^$+{}()|\\]/g, '\\$&')
    .replace(/\[([^\]]*?)$/g, '\\[$1')
    .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__GLOBSTAR_SLASH__/g, '(.*/)?')
    .replace(/__GLOBSTAR__/g, '.*')
  return new RegExp(`^${source}$`, caseInsensitive ? 'i' : '')
}

function resolveRelativePatternIdentity(cwd: string, pattern: string) {
  const resolvedPattern = path.resolve(resolveSandboxPath(cwd, pattern))
  if (!containsGlob(pattern)) return canonicalizeSandboxPath(resolvedPattern)

  const firstGlob = resolvedPattern.search(/[*?[\]]/)
  const separator = resolvedPattern.lastIndexOf(path.sep, firstGlob)
  const base = resolvedPattern.slice(0, separator) || path.parse(resolvedPattern).root
  return path.join(canonicalizeSandboxPath(base), resolvedPattern.slice(separator + 1))
}

function resolvePatternIdentity(cwd: string, pattern: string) {
  const expanded = expandHome(pattern.startsWith('@') ? pattern.slice(1) : pattern)
  return path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : resolveRelativePatternIdentity(cwd, pattern)
}

function targetMatchesPattern(target: NormalizedTarget, pattern: string, cwd: string) {
  const resolvedPattern = resolvePatternIdentity(cwd, pattern)
  if (containsGlob(pattern)) {
    const matcher = globToRegExp(
      resolvedPattern,
      isCaseInsensitiveFilesystem(resolvedPattern),
    )
    return matcher.test(target.lexical) || matcher.test(target.canonical)
  }

  return (
    pathIsEqualOrDescendant(target.lexical, resolvedPattern) ||
    pathIsEqualOrDescendant(target.canonical, resolvedPattern)
  )
}

function targetMatchesAny(target: NormalizedTarget, patterns: string[] | undefined, cwd: string) {
  return (patterns ?? []).some((pattern) => targetMatchesPattern(target, pattern, cwd))
}

const SECRET_ROOT_FILE_BASENAMES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
  '.env.staging',
  '.env.staging.local',
]
const SECRET_DIRECTORY_BASENAMES = new Set(['.secrets', 'secrets', 'credentials'])

/** Hard-blocked secret file patterns. Also the default `filesystem.denyWrite`. */
export const SECRET_DENY_WRITE_GLOBS = [
  ...SECRET_ROOT_FILE_BASENAMES.map((basename) => `**/${basename}`),
  '**/*.pem',
  '**/*.key',
]

const SECRET_POLICY = {
  templateSuffixes: new Set(['example', 'sample', 'template', 'dist']),
  directoryBasenames: SECRET_DIRECTORY_BASENAMES,
  rootFileBasenames: SECRET_ROOT_FILE_BASENAMES,
  nestedGlobs: [
    ...SECRET_DENY_WRITE_GLOBS,
    ...[...SECRET_DIRECTORY_BASENAMES].flatMap((basename) => [
      `**/${basename}`,
      `**/${basename}/**`,
    ]),
  ],
}

/** Precompiled once: `nestedGlobs` is a module constant matched on every write check. */
const NESTED_SECRET_MATCHERS = SECRET_POLICY.nestedGlobs.map((pattern) =>
  globToRegExp(pattern, true),
)

const WORKSPACE_SCAN_SKIP_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'target',
  'vendor',
])

function isSecretBasename(basename: string) {
  const normalized = basename.toLowerCase()
  if (normalized.endsWith('.pem') || normalized.endsWith('.key')) return true
  if (normalized === '.env') return true
  if (!normalized.startsWith('.env.')) return false
  return !SECRET_POLICY.templateSuffixes.has(normalized.split('.').at(-1)!)
}

type DiscoveredSecret = { path: string; isDirectory: boolean }

function collectNestedWorkspaceSecrets(workspaceCwd: string, maxDepth = 4) {
  const workspaceRoot = path.resolve(workspaceCwd)
  const secrets: DiscoveredSecret[] = []

  function scan(directory: string, depth: number) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)
      if (!entry.isDirectory() && isSecretBasename(entry.name)) {
        secrets.push({ path: entryPath, isDirectory: false })
      } else if (entry.isDirectory() && SECRET_POLICY.directoryBasenames.has(entry.name.toLowerCase())) {
        secrets.push({ path: entryPath, isDirectory: true })
      } else if (
        entry.isDirectory() &&
        depth < maxDepth &&
        !WORKSPACE_SCAN_SKIP_DIRECTORIES.has(entry.name)
      ) {
        scan(entryPath, depth + 1)
      }
    }
  }

  scan(workspaceRoot, 0)
  return secrets.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

function isRootSecretPath(
  targetPath: string,
  workspaceRoot: string,
  caseInsensitive: boolean,
) {
  const relative = path.relative(workspaceRoot, targetPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false
  const components = relative.split(path.sep)
  const rootBasename = normalizePathForComparison(components[0] ?? '', caseInsensitive)
  return (
    SECRET_POLICY.directoryBasenames.has(rootBasename) ||
    (components.length === 1 && SECRET_POLICY.rootFileBasenames.includes(rootBasename))
  )
}

function isDiscoveredSecretPath(targetPath: string, discovered: DiscoveredSecret[]) {
  return discovered.some((secret) =>
    pathsEqual(targetPath, secret.path) ||
    (secret.isDirectory && pathIsEqualOrDescendant(targetPath, secret.path)),
  )
}

function isDarwinNestedSecretPath(targetPath: string, workspaceRoot: string) {
  const relative = path.relative(workspaceRoot, targetPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false
  return NESTED_SECRET_MATCHERS.some((matcher) => matcher.test(relative))
}

function enforceableDirectDenyPatterns(
  patterns: string[] | undefined,
  platform: NodeJS.Platform,
) {
  if (platform !== 'linux') return patterns
  return patterns?.filter((pattern) =>
    !SECRET_POLICY.nestedGlobs.includes(pattern.replaceAll('\\', '/')),
  )
}

function isRuntimeEnforceableSecretTarget(
  target: NormalizedTarget,
  workspaceRoot: string,
  platform: NodeJS.Platform,
) {
  const identities = [target.lexical, target.canonical]
  const caseInsensitive = platform === 'darwin' || isCaseInsensitiveFilesystem(workspaceRoot)
  if (identities.some((identity) =>
    isRootSecretPath(identity, workspaceRoot, caseInsensitive),
  )) return true

  // Every path the scan can discover is secret-looking by construction, so this
  // pre-filter keeps the recursive walk off the common write path.
  if (identities.some((identity) => isSecretLookingPath(identity, workspaceRoot))) {
    const discovered = collectNestedWorkspaceSecrets(workspaceRoot)
    if (identities.some((identity) => isDiscoveredSecretPath(identity, discovered))) return true
  }

  return platform === 'darwin' && identities.some((identity) =>
    isDarwinNestedSecretPath(identity, workspaceRoot),
  )
}

function isSecretLookingPath(targetPath: string, workspaceRoot: string) {
  const relative = path.relative(workspaceRoot, targetPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false

  const components = relative.split(path.sep)
  return (
    components.some((component) =>
      SECRET_POLICY.directoryBasenames.has(component.toLowerCase()),
    ) ||
    isSecretBasename(components.at(-1)!)
  )
}

function isSensitiveSecretTarget(target: NormalizedTarget, workspaceRoot: string) {
  return [target.lexical, target.canonical].some((identity) =>
    isSecretLookingPath(identity, workspaceRoot),
  )
}

type FilesystemAccessRequest = {
  path: string
  access: 'read' | 'write'
  cwd: string
  filesystem?: {
    allowRead?: string[]
    allowWrite?: string[]
    denyRead?: string[]
    denyWrite?: string[]
  }
  sessionPaths?: ReadonlySet<string>
  protectedRoots: ProtectedSandboxRoots
  platform?: NodeJS.Platform
}

type FilesystemAccessDecision =
  | { status: 'allowed'; reason: 'session' | 'configured'; grantPath: string }
  | { status: 'denied'; reason: 'protected-sandbox-path' | 'denyWrite'; grantPath: string }
  | { status: 'approval-required'; reason: 'not-allowed' | 'sensitive-path'; grantPath: string }

export function decideFilesystemAccess(
  request: FilesystemAccessRequest,
): FilesystemAccessDecision {
  const target = normalizeTargetIdentity(request.cwd, request.path)
  const grantPath = target.canonical
  const filesystem = request.filesystem ?? {}

  if (request.access === 'write') {
    const platform = request.platform ?? process.platform
    const workspaceRoot = canonicalizeSandboxPath(path.resolve(request.cwd))
    if (isProtectedSandboxWrite(target, request.protectedRoots)) {
      return { status: 'denied', reason: 'protected-sandbox-path', grantPath }
    }
    if (
      isRuntimeEnforceableSecretTarget(target, workspaceRoot, platform) ||
      targetMatchesAny(
        target,
        enforceableDirectDenyPatterns(filesystem.denyWrite, platform),
        request.cwd,
      )
    ) {
      return { status: 'denied', reason: 'denyWrite', grantPath }
    }
    if (isSensitiveSecretTarget(target, workspaceRoot)) {
      return { status: 'approval-required', reason: 'sensitive-path', grantPath }
    }
  }

  if ([...(request.sessionPaths ?? [])].some((sessionPath) => pathsEqual(grantPath, sessionPath))) {
    return { status: 'allowed', reason: 'session', grantPath }
  }

  const allowedPatterns = request.access === 'read'
    ? filesystem.allowRead
    : filesystem.allowWrite
  const canonicalTarget = { lexical: target.canonical, canonical: target.canonical }
  if (targetMatchesAny(canonicalTarget, allowedPatterns, request.cwd)) {
    return { status: 'allowed', reason: 'configured', grantPath }
  }

  return { status: 'approval-required', reason: 'not-allowed', grantPath }
}

interface RuntimePolicyOptions {
  cwd: string
  platform?: NodeJS.Platform
  protectedRoots: ProtectedSandboxRoots
}

export function buildRuntimeConfigWithSessionGrants<Config extends {
  network?: { allowedDomains?: string[] }
  filesystem?: { allowRead?: string[]; allowWrite?: string[]; denyWrite?: string[] }
}>(
  config: Config,
  grants: {
    domains?: Iterable<string>
    readPaths?: Iterable<string>
    writePaths?: Iterable<string>
  },
  options: RuntimePolicyOptions,
): Config {
  const workspaceRoot = path.resolve(options.cwd)
  const platform = options.platform ?? process.platform
  const protectedRoots = options.protectedRoots
  const protectedWritePaths = [
    ...protectedRoots.sandboxDirs,
    ...protectedRoots.settingsPaths,
  ].flatMap((value) => {
    const { lexical, canonical } = rootIdentity(value)
    return [lexical, canonical]
  })
  const configuredRuntimePaths = (config.filesystem?.denyWrite ?? []).flatMap((pattern) => {
    const normalizedPattern = pattern.replaceAll('\\', '/')
    if (normalizedPattern === '/**') return [path.parse(normalizedPattern).root]
    if (platform === 'darwin' && containsGlob(pattern)) return [pattern]

    const trailingDirectoryGlob = normalizedPattern.endsWith('/**')
      ? pattern.slice(0, -3)
      : undefined
    if (trailingDirectoryGlob !== undefined && !containsGlob(trailingDirectoryGlob)) {
      return [path.resolve(resolveSandboxPath(workspaceRoot, trailingDirectoryGlob))]
    }
    if (containsGlob(pattern)) {
      if (SECRET_POLICY.nestedGlobs.includes(normalizedPattern)) return []
      throw new Error(`Unsupported Linux sandbox denyWrite glob: ${pattern}`)
    }
    return [path.resolve(resolveSandboxPath(workspaceRoot, pattern))]
  })
  const rootSecretPaths = [
    ...SECRET_POLICY.rootFileBasenames.map((basename) => path.join(workspaceRoot, basename)),
    ...[...SECRET_POLICY.directoryBasenames].map((basename) => path.join(workspaceRoot, basename)),
  ]
  const nestedSecretPaths = collectNestedWorkspaceSecrets(workspaceRoot).map((s) => s.path)
  const darwinCreateGlobs = platform === 'darwin'
    ? SECRET_POLICY.nestedGlobs.map((pattern) => path.join(workspaceRoot, pattern))
    : []

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
      denyWrite: [...new Set([
        ...configuredRuntimePaths,
        ...rootSecretPaths,
        ...nestedSecretPaths,
        ...darwinCreateGlobs,
        ...protectedWritePaths,
      ])],
    },
  }
}
