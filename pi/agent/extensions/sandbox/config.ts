import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime'
import { loadExtensionSettings } from '../__lib/extension-settings.ts'
import { SECRET_DENY_WRITE_GLOBS } from './policy.ts'

export interface SandboxConfig extends SandboxRuntimeConfig {
  enabled?: boolean
  filesystem?: SandboxRuntimeConfig['filesystem'] & {
    allowRead?: string[]
  }
}

export const DEFAULT_CONFIG: SandboxConfig = {
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
    allowRead: ['.'],
    allowWrite: ['.', '/tmp'],
    denyWrite: [...SECRET_DENY_WRITE_GLOBS],
  },
}

export const EXTENSION_NAME = 'sandbox'
export const ALLOW_READ_KEY = 'allowRead'
export const ALLOW_WRITE_KEY = 'allowWrite'

export function deepMerge(
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

export function loadConfig(cwd: string): SandboxConfig {
  const settings = loadExtensionSettings<SandboxConfig>(
    EXTENSION_NAME,
    cwd,
    deepMerge,
  )
  return deepMerge(DEFAULT_CONFIG, settings)
}

function mergeSorted(current: string[] | undefined, additions: string[]) {
  return [...new Set([...(current ?? []), ...additions])].sort()
}

function updateSettingsFile(
  filePath: string,
  mutate: (existing: Partial<SandboxConfig>) => Partial<SandboxConfig>,
) {
  const existing: Partial<SandboxConfig> = existsSync(filePath)
    ? (JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<SandboxConfig>)
    : {}

  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(mutate(existing), null, 2)}\n`, 'utf-8')
}

export function updateAllowedDomains(filePath: string, domains: string[]) {
  updateSettingsFile(filePath, (existing) => ({
    ...existing,
    network: {
      ...(existing.network ?? {}),
      allowedDomains: mergeSorted(existing.network?.allowedDomains, domains),
    },
  }))
}

export function updateFilesystemAllowList(
  filePath: string,
  key: typeof ALLOW_READ_KEY | typeof ALLOW_WRITE_KEY,
  paths: string[],
) {
  updateSettingsFile(filePath, (existing) => ({
    ...existing,
    filesystem: {
      ...(existing.filesystem ?? {}),
      [key]: mergeSorted(existing.filesystem?.[key], paths),
    },
  }))
}
