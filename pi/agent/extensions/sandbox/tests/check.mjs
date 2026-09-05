import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import {
  buildRuntimeConfigWithSessionGrants,
  decideFilesystemAccess,
  domainMatches,
  extractCommandDomains,
  extractDomainsFromUrls,
} from '../policy.ts'
import { tempRoot } from './helpers.mjs'

const cwd = '/repo'

describe('domain policy', () => {
  const matchCases = [
    ['*', 'anything.example', true],
    ['github.com', 'github.com', true],
    ['github.com', 'api.github.com', false],
    ['*.github.com', 'github.com', true],
    ['*.github.com', 'api.github.com', true],
    ['*.github.com', 'notgithub.com', false],
    ['GITHUB.COM', 'github.com', true],
  ]

  for (const [pattern, domain, expected] of matchCases) {
    test(`${pattern} ${expected ? 'matches' : 'does not match'} ${domain}`, () => {
      assert.equal(domainMatches(pattern, domain), expected)
    })
  }

  test('extracts unique valid domains from URLs', () => {
    assert.deepEqual(extractDomainsFromUrls([
      'https://github.com/a',
      'bad',
      'http://api.github.com?q=1',
    ]).sort(), ['api.github.com', 'github.com'])
  })

  const commandCases = [
    ['HTTP URLs', 'curl https://herdr.dev/docs && wget http://getmoshi.app/', ['getmoshi.app', 'herdr.dev']],
    ['Git SSH URLs', 'git clone git@github.com:org/repo.git', ['github.com']],
    ['SSH hosts', 'ssh deploy@example.com uptime', ['example.com']],
    ['bare curl and wget hosts', 'curl example.org && wget api.example.org/file', ['api.example.org', 'example.org']],
    ['npm registry URLs', 'npm config set registry https://registry.npmjs.org/', ['registry.npmjs.org']],
  ]

  for (const [name, command, expected] of commandCases) {
    test(`extracts domains from ${name}`, () => {
      assert.deepEqual(extractCommandDomains(command).sort(), expected)
    })
  }
})

describe('direct filesystem access policy', () => {
  function decide(overrides = {}) {
    return decideFilesystemAccess({
      path: 'src/index.ts',
      access: 'read',
      cwd,
      filesystem: {},
      protectedRoots: { sandboxDirs: [], settingsPaths: [] },
      ...overrides,
    })
  }

  test('normalizes relative, @-prefixed, and home-relative targets into canonical grant paths', () => {
    assert.equal(decide({ path: 'src/index.ts' }).grantPath, path.join(cwd, 'src/index.ts'))
    assert.equal(decide({ path: '@src/index.ts' }).grantPath, path.join(cwd, 'src/index.ts'))
    assert.equal(
      decide({ path: '~/sandbox-test' }).grantPath,
      path.join(fs.realpathSync(os.homedir()), 'sandbox-test'),
    )
  })

  test('falls back to os.homedir when HOME is unset', () => {
    const originalHome = process.env.HOME
    try {
      delete process.env.HOME
      assert.equal(
        decide({ path: '~/sandbox-test' }).grantPath,
        path.join(fs.realpathSync(os.homedir()), 'sandbox-test'),
      )
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
    }
  })

  test('allows configured descendants and canonical session grants', (t) => {
    const root = tempRoot(t, 'sandbox-access')
    const real = path.join(root, 'real')
    const alias = path.join(root, 'alias')
    fs.mkdirSync(real)
    fs.symlinkSync(real, alias)
    const target = path.join(alias, 'value.txt')
    const grantPath = path.join(fs.realpathSync(real), 'value.txt')

    assert.deepEqual(decide({
      cwd: root,
      path: target,
      filesystem: { allowRead: [real] },
    }), { status: 'allowed', reason: 'configured', grantPath })
    assert.deepEqual(decide({
      cwd: root,
      path: target,
      sessionPaths: new Set([grantPath]),
    }), { status: 'allowed', reason: 'session', grantPath })
  })

  test('canonicalizes relative project policy against a symlinked cwd', (t) => {
    const root = tempRoot(t, 'sandbox-relative-policy')
    const workspace = path.join(root, 'workspace')
    const cwdAlias = path.join(root, 'workspace-alias')
    fs.mkdirSync(path.join(workspace, 'src'), { recursive: true })
    fs.symlinkSync(workspace, cwdAlias)

    for (const pattern of ['.', 'src']) {
      assert.deepEqual(decide({
        cwd: cwdAlias,
        path: path.join(cwdAlias, 'src/value.ts'),
        access: 'write',
        filesystem: { allowWrite: [pattern] },
      }), {
        status: 'allowed',
        reason: 'configured',
        grantPath: path.join(workspace, 'src/value.ts'),
      })
    }

    assert.deepEqual(decide({
      cwd: cwdAlias,
      platform: 'linux',
      path: path.join(workspace, 'src/.env.customer'),
      access: 'write',
      filesystem: { allowWrite: ['.'] },
    }), {
      status: 'approval-required',
      reason: 'sensitive-path',
      grantPath: path.join(workspace, 'src/.env.customer'),
    })
  })

  test('does not canonicalize absolute policy paths when a symlink retargets', async (t) => {
    const root = tempRoot(t, 'sandbox-absolute-policy')
    const alias = path.join(root, 'configured')
    const firstTarget = path.join(root, 'first')
    const secondTarget = path.join(root, 'second')
    fs.mkdirSync(firstTarget)
    fs.mkdirSync(secondTarget)
    fs.symlinkSync(firstTarget, alias)

    const request = {
      cwd: root,
      path: path.join(alias, 'value.txt'),
      access: 'write',
      filesystem: { allowWrite: [alias] },
      protectedRoots: { sandboxDirs: [], settingsPaths: [] },
    }
    assert.equal(decide(request).status, 'approval-required')

    fs.unlinkSync(alias)
    fs.symlinkSync(secondTarget, alias)
    const freshPolicy = await import(`../policy.ts?absolute-reload=${Date.now()}`)
    assert.equal(freshPolicy.decideFilesystemAccess(request).status, 'approval-required')
  })

  test('keeps configured paths lexical across a fresh module load and symlink retarget', async (t) => {
    const root = tempRoot(t, 'sandbox-policy-reload')
    const alias = path.join(root, 'configured')
    const firstTarget = path.join(root, 'first')
    const secondTarget = path.join(root, 'second')
    fs.mkdirSync(firstTarget)
    fs.mkdirSync(secondTarget)
    fs.symlinkSync(firstTarget, alias)

    const freshPolicy = await import(`../policy.ts?reload=${Date.now()}`)
    const request = {
      cwd: root,
      path: path.join(alias, 'value.txt'),
      access: 'write',
      filesystem: { allowWrite: [root], denyWrite: [alias] },
      protectedRoots: { sandboxDirs: [], settingsPaths: [] },
    }
    assert.equal(freshPolicy.decideFilesystemAccess(request).status, 'denied')

    fs.unlinkSync(alias)
    fs.symlinkSync(secondTarget, alias)
    assert.equal(freshPolicy.decideFilesystemAccess(request).status, 'denied')
  })

  test('does not let a lexical allow path authorize a symlink escape', (t) => {
    const root = tempRoot(t, 'sandbox-allow-escape')
    const allowedRoot = path.join(root, 'allowed')
    const escapedRoot = path.join(root, 'escaped')
    fs.mkdirSync(allowedRoot)
    fs.mkdirSync(escapedRoot)
    const escapedFile = path.join(escapedRoot, 'value.txt')
    const alias = path.join(allowedRoot, 'value.txt')
    fs.writeFileSync(escapedFile, 'value')
    fs.symlinkSync(escapedFile, alias)

    const decision = decide({
      cwd: root,
      path: alias,
      filesystem: { allowRead: [allowedRoot] },
    })
    assert.equal(decision.status, 'approval-required')
    assert.equal(decision.grantPath, fs.realpathSync(escapedFile))
  })

  test('requires approval with a canonical grant path when no allow rule matches', () => {
    assert.deepEqual(decide(), {
      status: 'approval-required',
      reason: 'not-allowed',
      grantPath: path.join(cwd, 'src/index.ts'),
    })
  })

  test('preserves denyRead as runtime-only behavior for direct reads', () => {
    assert.equal(decide({
      path: '.ssh/id_ed25519',
      filesystem: { allowRead: ['.ssh'], denyRead: ['.ssh'] },
    }).status, 'allowed')
  })

  test('matches session grants using filesystem-aware path equality', (t) => {
    const root = tempRoot(t, 'sandbox-session-case')
    const grant = path.join(root, 'CaseProbe')
    fs.mkdirSync(grant)
    const alternate = path.join(root, 'caseProbe')

    const decision = decide({
      cwd: root,
      path: alternate,
      sessionPaths: new Set([fs.realpathSync(grant)]),
    })
    assert.equal(decision.status, fs.existsSync(alternate) ? 'allowed' : 'approval-required')
    if (decision.status === 'allowed') assert.equal(decision.reason, 'session')
  })

  test('hard-denies writes before configured or session allows', () => {
    const target = path.join(cwd, '.env.local')
    assert.deepEqual(decide({
      path: target,
      access: 'write',
      filesystem: { allowWrite: ['.'], denyWrite: ['**/.env.local'] },
      sessionPaths: new Set([target]),
    }), { status: 'denied', reason: 'denyWrite', grantPath: target })
  })

  test('matches Linux direct secret decisions to exact runtime protections', (t) => {
    const root = tempRoot(t, 'sandbox-linux-direct-secrets')
    fs.mkdirSync(path.join(root, 'nested/credentials'), { recursive: true })
    fs.writeFileSync(path.join(root, 'nested/.env.customer'), 'secret')
    fs.writeFileSync(path.join(root, 'nested/existing.key'), 'secret')

    for (const relativePath of [
      '.env', '.env.local', '.secrets/token', 'secrets/api/token', 'credentials/service.json',
      'nested/.env.customer', 'nested/existing.key', 'nested/credentials/service.json',
    ]) {
      assert.equal(decide({ cwd: root, platform: 'linux', path: relativePath, access: 'write', filesystem: { allowWrite: ['.'] } }).status, 'denied')
    }
    for (const relativePath of [
      '.env.customer', 'nested/.env.local', 'nested/missing.key', 'nested/secrets/token',
    ]) {
      assert.deepEqual(decide({
        cwd: root,
        platform: 'linux',
        path: relativePath,
        access: 'write',
        filesystem: { allowWrite: ['.'] },
      }), {
        status: 'approval-required',
        reason: 'sensitive-path',
        grantPath: path.join(root, relativePath),
      })
    }
    for (const relativePath of [
      '.env.example', '.env.sample', '.env.template', '.env.dist', 'README.md',
    ]) {
      assert.equal(decide({ cwd: root, platform: 'linux', path: relativePath, access: 'write', filesystem: { allowWrite: ['.'] } }).status, 'allowed')
    }
  })

  test('requires approval for absent mixed-case secrets Linux cannot enforce exactly', (t) => {
    const root = tempRoot(t, 'sandbox-linux-mixed-case-secrets')
    const caseProbe = path.join(root, 'CaseProbe')
    fs.writeFileSync(caseProbe, '')
    const caseInsensitive = fs.existsSync(path.join(root, 'caseProbe'))

    for (const relativePath of [
      '.ENV', '.Env.Local', 'Secrets/token', 'CREDENTIALS/service.json',
    ]) {
      const decision = decide({
        cwd: root,
        platform: 'linux',
        path: relativePath,
        access: 'write',
        filesystem: { allowWrite: ['.'] },
      })
      assert.equal(decision.status, caseInsensitive ? 'denied' : 'approval-required')
      if (!caseInsensitive) assert.equal(decision.reason, 'sensitive-path')
    }
    for (const relativePath of ['nested/missing.PEM', 'nested/missing.Key']) {
      assert.deepEqual(decide({
        cwd: root,
        platform: 'linux',
        path: relativePath,
        access: 'write',
        filesystem: { allowWrite: ['.'] },
      }), {
        status: 'approval-required',
        reason: 'sensitive-path',
        grantPath: path.join(root, relativePath),
      })
    }
  })

  test('keeps existing mixed-case secrets denied on case-sensitive Linux', (t) => {
    const root = tempRoot(t, 'sandbox-linux-existing-mixed-case-secrets')
    fs.writeFileSync(path.join(root, '.ENV'), 'secret')
    fs.mkdirSync(path.join(root, 'Secrets'))
    fs.writeFileSync(path.join(root, 'nested.Key'), 'secret')

    for (const relativePath of ['.ENV', 'Secrets/token', 'nested.Key']) {
      assert.equal(decide({
        cwd: root,
        platform: 'linux',
        path: relativePath,
        access: 'write',
        filesystem: { allowWrite: ['.'] },
      }).status, 'denied')
    }
  })

  test('preserves case-insensitive direct secret protection on Darwin', (t) => {
    const root = tempRoot(t, 'sandbox-darwin-mixed-case-secrets')

    for (const relativePath of [
      '.ENV', '.Env.Local', 'Secrets/token', 'CREDENTIALS/service.json',
      'nested/missing.PEM', 'nested/missing.Key',
    ]) {
      assert.equal(decide({
        cwd: root,
        platform: 'darwin',
        path: relativePath,
        access: 'write',
        filesystem: { allowWrite: ['.'] },
      }).status, 'denied')
    }
  })

  test('does not apply Linux runtime-only secret globs to absent nested paths', (t) => {
    const root = tempRoot(t, 'sandbox-linux-secret-globs')
    const filesystem = {
      allowWrite: ['.'],
      denyWrite: ['**/.env.local', '**/*.key', '**/credentials', '**/credentials/**'],
    }

    for (const relativePath of [
      'nested/.env.local', 'nested/missing.key',
      'nested/credentials', 'nested/credentials/token',
    ]) {
      assert.deepEqual(decide({
        cwd: root,
        platform: 'linux',
        path: relativePath,
        access: 'write',
        filesystem,
        sessionPaths: new Set([path.join(root, relativePath)]),
      }), {
        status: 'approval-required',
        reason: 'sensitive-path',
        grantPath: path.join(root, relativePath),
      })
    }
  })

  test('hard-denies absent nested common secrets on Darwin and requires approval for other secret-looking paths', (t) => {
    const root = tempRoot(t, 'sandbox-darwin-direct-secrets')

    for (const relativePath of [
      'nested/.env', 'nested/.env.production.local', 'nested/missing.key',
      'nested/.secrets', 'nested/.secrets/token', 'nested/credentials', 'nested/credentials/token',
    ]) {
      assert.equal(decide({ cwd: root, platform: 'darwin', path: relativePath, access: 'write', filesystem: { allowWrite: ['.'] } }).status, 'denied')
    }
    assert.deepEqual(decide({
      cwd: root,
      platform: 'darwin',
      path: 'nested/.env.customer',
      access: 'write',
      filesystem: { allowWrite: ['.'] },
    }), {
      status: 'approval-required',
      reason: 'sensitive-path',
      grantPath: path.join(root, 'nested/.env.customer'),
    })
    assert.equal(decide({
      cwd: root,
      platform: 'darwin',
      path: 'nested/.env.example',
      access: 'write',
      filesystem: { allowWrite: ['.'] },
    }).status, 'allowed')
  })

  test('denies lexical and canonical glob matches through symlinks', (t) => {
    const root = tempRoot(t, 'sandbox-secret-policy')
    const nested = path.join(root, 'nested')
    fs.mkdirSync(nested)
    const secret = path.join(nested, 'secret.pem')
    const alias = path.join(root, 'readme.txt')
    fs.writeFileSync(secret, 'secret')
    fs.symlinkSync(secret, alias)

    assert.equal(decide({ cwd: root, path: alias, access: 'write', filesystem: { allowWrite: ['.'], denyWrite: ['**/*.pem'] } }).status, 'denied')

    const safe = path.join(nested, 'safe.txt')
    const deniedAlias = path.join(root, '.env.local')
    fs.writeFileSync(safe, 'safe')
    fs.symlinkSync(safe, deniedAlias)
    assert.equal(decide({ cwd: root, path: deniedAlias, access: 'write', filesystem: { allowWrite: ['.'], denyWrite: ['.env.*'] } }).status, 'denied')
  })

  test('supports star, question-mark, character-class, and globstar deny patterns', () => {
    const cases = [
      ['config.local', 'config.*', true],
      ['config.local', 'config.?ocal', true],
      ['config.prod', 'config.[pl]rod', true],
      ['config.xrod', 'config.[pl]rod', false],
      ['nested/secret.txt', '*.txt', false],
      ['nested/secret.txt', '**/*.txt', true],
    ]
    for (const [file, pattern, denied] of cases) {
      const decision = decide({ path: file, access: 'write', filesystem: { allowWrite: ['.'], denyWrite: [pattern] } })
      assert.equal(decision.status === 'denied', denied)
    }
  })

  test('follows the filesystem case-sensitivity behavior for configured paths', (t) => {
    const root = tempRoot(t, 'sandbox-case-policy')
    const configuredRoot = path.join(root, 'CaseProbe')
    const differentlyCasedRoot = path.join(root, 'caseProbe')
    fs.mkdirSync(configuredRoot)

    const decision = decide({
      cwd: root,
      path: path.join(differentlyCasedRoot, 'value.txt'),
      filesystem: { allowRead: [configuredRoot] },
    })
    assert.equal(decision.status, fs.existsSync(differentlyCasedRoot) ? 'allowed' : 'approval-required')
  })

  test('protects sandbox directories and exact settings across aliases and dangling descendants', (t) => {
    const root = tempRoot(t, 'sandbox-protected')
    const sandboxDir = path.join(root, 'protected/extensions/sandbox')
    const settingsPath = path.join(root, 'protected/sandbox.settings.json')
    fs.mkdirSync(sandboxDir, { recursive: true })
    const alias = path.join(root, 'sandbox-alias')
    fs.symlinkSync(path.join(sandboxDir, 'missing'), alias)
    const roots = { sandboxDirs: [sandboxDir], settingsPaths: [settingsPath] }

    for (const target of [path.join(sandboxDir, 'index.ts'), path.join(alias, 'index.ts'), settingsPath]) {
      const decision = decide({ path: target, access: 'write', filesystem: { allowWrite: ['/'] }, protectedRoots: roots })
      assert.equal(decision.status, 'denied')
      assert.equal(decision.reason, 'protected-sandbox-path')
    }
    assert.notEqual(decide({ path: settingsPath + '.tmp', access: 'write', filesystem: { allowWrite: ['/'] }, protectedRoots: roots }).reason, 'protected-sandbox-path')
  })

  test('protects a sandbox path reached through a symlink followed by ..', (t) => {
    const root = tempRoot(t, 'sandbox-symlink-parent')
    const protectedRoot = path.join(root, 'protected')
    const sub = path.join(protectedRoot, 'sub')
    fs.mkdirSync(sub, { recursive: true })
    const alias = path.join(root, 'alias')
    fs.symlinkSync(sub, alias)

    const decision = decide({
      path: alias + path.sep + '..' + path.sep + 'probe.txt',
      access: 'write',
      filesystem: { allowWrite: ['/'] },
      protectedRoots: { sandboxDirs: [protectedRoot], settingsPaths: [] },
    })
    assert.equal(decision.status, 'denied')
    assert.equal(decision.reason, 'protected-sandbox-path')
  })
})

describe('runtime config session grants', () => {
  test('merges grants and protects lexical and canonical security paths', (t) => {
    const runtimeRoot = tempRoot(t, 'sandbox-runtime-policy')

    const lexicalSandboxDir = path.join(runtimeRoot, 'sandbox-link')
    const canonicalSandboxDir = path.join(runtimeRoot, 'sandbox-real')
    const lexicalSettingsPath = path.join(runtimeRoot, 'settings-link.json')
    const canonicalSettingsPath = path.join(runtimeRoot, 'settings-real.json')
    fs.mkdirSync(canonicalSandboxDir)
    fs.writeFileSync(canonicalSettingsPath, '{}')
    fs.symlinkSync(canonicalSandboxDir, lexicalSandboxDir)
    fs.symlinkSync(canonicalSettingsPath, lexicalSettingsPath)

    const runtimeConfig = buildRuntimeConfigWithSessionGrants(
      {
        enabled: true,
        network: { allowedDomains: ['github.com'], deniedDomains: ['blocked.example'] },
        filesystem: { allowRead: ['.'], allowWrite: [runtimeRoot], denyWrite: ['.env'] },
      },
      {
        domains: new Set(['iana.org']),
        readPaths: new Set(['/extra-read']),
        writePaths: new Set(['/extra-write']),
      },
      {
        cwd: runtimeRoot,
        platform: 'linux',
        protectedRoots: {
          sandboxDirs: [lexicalSandboxDir],
          settingsPaths: [
            lexicalSettingsPath,
            path.join(runtimeRoot, 'project.settings.json'),
            path.join(runtimeRoot, 'local.settings.json'),
          ],
        },
      },
    )

    assert.deepEqual(runtimeConfig.network.allowedDomains, ['github.com', 'iana.org'])
    assert.deepEqual(runtimeConfig.network.deniedDomains, ['blocked.example'])
    assert.deepEqual(runtimeConfig.filesystem.allowRead, ['.', '/extra-read'])
    assert.deepEqual(runtimeConfig.filesystem.allowWrite, [runtimeRoot, '/extra-write'])
    assert.deepEqual(runtimeConfig.filesystem.denyWrite, [
      path.join(runtimeRoot, '.env'),
      path.join(runtimeRoot, '.env.local'),
      path.join(runtimeRoot, '.env.development'),
      path.join(runtimeRoot, '.env.development.local'),
      path.join(runtimeRoot, '.env.production'),
      path.join(runtimeRoot, '.env.production.local'),
      path.join(runtimeRoot, '.env.test'),
      path.join(runtimeRoot, '.env.test.local'),
      path.join(runtimeRoot, '.env.staging'),
      path.join(runtimeRoot, '.env.staging.local'),
      path.join(runtimeRoot, '.secrets'),
      path.join(runtimeRoot, 'secrets'),
      path.join(runtimeRoot, 'credentials'),
      lexicalSandboxDir,
      fs.realpathSync(canonicalSandboxDir),
      lexicalSettingsPath,
      fs.realpathSync(canonicalSettingsPath),
      path.join(runtimeRoot, 'project.settings.json'),
      path.join(runtimeRoot, 'local.settings.json'),
    ])
  })

  test('rejects unsupported Linux deny globs instead of dropping them', () => {
    assert.throws(
      () => buildRuntimeConfigWithSessionGrants(
        { filesystem: { denyWrite: ['private/*.json'] } },
        {},
        {
          cwd: '/workspace',
          platform: 'linux',
          protectedRoots: { sandboxDirs: [], settingsPaths: [] },
        },
      ),
      /Unsupported Linux sandbox denyWrite glob: private\/\*\.json/,
    )
  })

  test('builds a Linux policy from exact paths without runtime globs', (t) => {
    const workspace = tempRoot(t, 'sandbox-linux-policy')
    const nested = path.join(workspace, 'src/config')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, '.env.production'), 'secret')
    fs.writeFileSync(path.join(nested, 'signing.key'), 'secret')

    const runtimeConfig = buildRuntimeConfigWithSessionGrants(
      { filesystem: { denyWrite: ['**/.env', '**/*.key', 'generated/**', '/fixed/deny'] } },
      {},
      {
        cwd: workspace,
        platform: 'linux',
        protectedRoots: {
          sandboxDirs: ['/protected/sandbox'],
          settingsPaths: ['/protected/settings.json'],
        },
      },
    )

    assert.ok(runtimeConfig.filesystem.denyWrite.includes('/fixed/deny'))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes(path.join(workspace, 'generated')))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes(path.join(nested, '.env.production')))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes(path.join(nested, 'signing.key')))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes(path.join(workspace, '.env')))
    assert.equal(runtimeConfig.filesystem.denyWrite.some((value) => /[*?[\]]/.test(value)), false)
  })

  test('protects absent common environment variants on Linux without protecting templates', (t) => {
    const workspace = tempRoot(t, 'sandbox-linux-env-create-policy')

    const runtimeConfig = buildRuntimeConfigWithSessionGrants(
      { filesystem: { denyWrite: [] } },
      {},
      {
        cwd: workspace,
        platform: 'linux',
        protectedRoots: { sandboxDirs: [], settingsPaths: [] },
      },
    )

    for (const basename of [
      '.env',
      '.env.local',
      '.env.development',
      '.env.development.local',
      '.env.test',
      '.env.test.local',
      '.env.production',
      '.env.production.local',
      '.env.staging',
      '.env.staging.local',
    ]) {
      assert.ok(runtimeConfig.filesystem.denyWrite.includes(path.join(workspace, basename)))
    }
    for (const basename of ['.env.example', '.env.sample', '.env.template', '.env.dist']) {
      assert.equal(runtimeConfig.filesystem.denyWrite.includes(path.join(workspace, basename)), false)
    }
  })

  test('adds Darwin nested-create globs and exact root create paths', () => {
    const runtimeConfig = buildRuntimeConfigWithSessionGrants(
      { filesystem: { denyWrite: ['**/.env', 'generated/**', 'private/*.json'] } },
      {},
      {
        cwd: '/workspace',
        platform: 'darwin',
        protectedRoots: {
          sandboxDirs: ['/protected/sandbox'],
          settingsPaths: ['/protected/settings.json'],
        },
      },
    )

    assert.ok(runtimeConfig.filesystem.denyWrite.includes('/workspace/.env'))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes('/workspace/.env.local'))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes('**/.env'))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes('/workspace/**/.env.local'))
    for (const basename of [
      '.env.development.local',
      '.env.test.local',
      '.env.production.local',
      '.env.staging.local',
    ]) {
      assert.ok(runtimeConfig.filesystem.denyWrite.includes(`/workspace/${basename}`))
      assert.ok(runtimeConfig.filesystem.denyWrite.includes(`/workspace/**/${basename}`))
    }
    assert.ok(runtimeConfig.filesystem.denyWrite.includes('/workspace/**/*.pem'))
    for (const basename of ['.secrets', 'secrets', 'credentials']) {
      assert.ok(runtimeConfig.filesystem.denyWrite.includes(`/workspace/**/${basename}`))
      assert.ok(runtimeConfig.filesystem.denyWrite.includes(`/workspace/**/${basename}/**`))
    }
    assert.ok(runtimeConfig.filesystem.denyWrite.includes('generated/**'))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes('private/*.json'))
    assert.equal(runtimeConfig.filesystem.denyWrite.includes('/workspace/**/.env.*'), false)
    assert.equal(runtimeConfig.filesystem.denyWrite.includes('**/.env.*'), false)
    for (const suffix of ['example', 'sample', 'template', 'dist']) {
      assert.equal(runtimeConfig.filesystem.denyWrite.includes(`/workspace/.env.${suffix}`), false)
      assert.equal(runtimeConfig.filesystem.denyWrite.includes(`/workspace/**/.env.${suffix}`), false)
    }
  })

  for (const platform of ['linux', 'darwin']) {
    test(`normalizes root descendant glob to exact root on ${platform}`, () => {
      const runtimeConfig = buildRuntimeConfigWithSessionGrants(
        { filesystem: { denyWrite: ['/**'] } },
        {},
        {
          cwd: '/workspace',
          platform,
          protectedRoots: { sandboxDirs: [], settingsPaths: [] },
        },
      )

      assert.ok(runtimeConfig.filesystem.denyWrite.includes('/'))
      assert.equal(runtimeConfig.filesystem.denyWrite.includes('/workspace'), false)
      assert.equal(runtimeConfig.filesystem.denyWrite.includes('/**'), false)
    })
  }
})

describe('portable nested-secret runtime policy', () => {
  test('scans through depth four and skips dependency and build directories', (t) => {
    const workspace = tempRoot(t, 'sandbox-secret-scan')
    const atDepthFour = path.join(workspace, 'one/two/three/four')
    const tooDeep = path.join(atDepthFour, 'five')
    fs.mkdirSync(tooDeep, { recursive: true })
    fs.writeFileSync(path.join(atDepthFour, 'found.pem'), 'secret')
    fs.writeFileSync(path.join(tooDeep, 'ignored.key'), 'secret')
    fs.writeFileSync(path.join(atDepthFour, '.env.customer'), 'secret')
    fs.writeFileSync(path.join(atDepthFour, '.env.example'), 'template')
    const nestedCredentials = path.join(workspace, 'services/api/credentials')
    fs.mkdirSync(nestedCredentials, { recursive: true })
    fs.writeFileSync(path.join(nestedCredentials, 'service.json'), 'secret')
    for (const skipped of ['.git', 'node_modules', 'dist', 'build', 'coverage', 'target', 'vendor']) {
      fs.mkdirSync(path.join(workspace, skipped), { recursive: true })
      fs.writeFileSync(path.join(workspace, skipped, '.env'), 'secret')
    }

    const runtimeConfig = buildRuntimeConfigWithSessionGrants(
      { filesystem: { denyWrite: [] } },
      {},
      {
        cwd: workspace,
        platform: 'linux',
        protectedRoots: { sandboxDirs: [], settingsPaths: [] },
      },
    )
    assert.ok(runtimeConfig.filesystem.denyWrite.includes(path.join(atDepthFour, '.env.customer')))
    assert.ok(runtimeConfig.filesystem.denyWrite.includes(path.join(atDepthFour, 'found.pem')))
    assert.equal(runtimeConfig.filesystem.denyWrite.includes(path.join(tooDeep, 'ignored.key')), false)
    assert.equal(runtimeConfig.filesystem.denyWrite.includes(path.join(atDepthFour, '.env.example')), false)
    assert.ok(runtimeConfig.filesystem.denyWrite.includes(nestedCredentials))
    for (const skipped of ['.git', 'node_modules', 'dist', 'build', 'coverage', 'target', 'vendor']) {
      assert.equal(runtimeConfig.filesystem.denyWrite.includes(path.join(workspace, skipped, '.env')), false)
    }
  })
})
