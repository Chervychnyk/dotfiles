import assert from 'node:assert/strict'
import path from 'node:path'
import {
  buildRuntimeConfigWithSessionGrants,
  domainMatches,
  extractCommandDomains,
  extractDomainsFromUrls,
  parsePermissionChoice,
  pathMatchesAny,
  pathMatchesPattern,
  resolveSandboxPath,
} from '../policy.ts'

const cwd = '/repo'

assert.equal(domainMatches('*', 'anything.example'), true)
assert.equal(domainMatches('github.com', 'github.com'), true)
assert.equal(domainMatches('github.com', 'api.github.com'), false)
assert.equal(domainMatches('*.github.com', 'github.com'), true)
assert.equal(domainMatches('*.github.com', 'api.github.com'), true)
assert.equal(domainMatches('*.github.com', 'notgithub.com'), false)
assert.equal(domainMatches('GITHUB.COM', 'github.com'), true)

assert.deepEqual(extractDomainsFromUrls(['https://github.com/a', 'bad', 'http://api.github.com?q=1']).sort(), [
  'api.github.com',
  'github.com',
])
assert.deepEqual(extractCommandDomains('curl https://herdr.dev/docs && wget http://getmoshi.app/').sort(), [
  'getmoshi.app',
  'herdr.dev',
])
assert.deepEqual(extractCommandDomains('git clone git@github.com:org/repo.git'), ['github.com'])
assert.deepEqual(extractCommandDomains('ssh deploy@example.com uptime'), ['example.com'])
assert.deepEqual(extractCommandDomains('curl example.org && wget api.example.org/file').sort(), [
  'api.example.org',
  'example.org',
])
assert.deepEqual(extractCommandDomains('npm config set registry https://registry.npmjs.org/'), ['registry.npmjs.org'])

assert.equal(parsePermissionChoice('a'), 'abort')
assert.equal(parsePermissionChoice('[s] session'), 'session')
assert.equal(parsePermissionChoice('project'), 'project')
assert.equal(parsePermissionChoice('g'), 'global')
assert.equal(parsePermissionChoice(undefined), 'abort')
assert.equal(parsePermissionChoice('wat'), 'abort')

assert.equal(resolveSandboxPath(cwd, 'src/index.ts'), path.join(cwd, 'src/index.ts'))
assert.equal(resolveSandboxPath(cwd, '@src/index.ts'), path.join(cwd, 'src/index.ts'))
assert.equal(resolveSandboxPath(cwd, '.'), cwd)
assert.equal(resolveSandboxPath(cwd, '~/sandbox-test'), path.join(process.env.HOME, 'sandbox-test'))

assert.equal(pathMatchesPattern(path.join(cwd, 'src/index.ts'), path.join(cwd, 'src/index.ts'), cwd), true)
assert.equal(pathMatchesPattern(path.join(cwd, 'src/index.ts'), '.', cwd), true)
assert.equal(pathMatchesPattern(path.join(cwd, 'src/index.ts'), 'src', cwd), true)
assert.equal(pathMatchesPattern(path.join(cwd, 'src/index.ts'), 'other', cwd), false)
assert.equal(pathMatchesPattern(path.join(cwd, '.env.local'), '.env.*', cwd), true)
assert.equal(pathMatchesPattern(path.join(cwd, 'secret.pem'), '*.pem', cwd), true)
assert.equal(pathMatchesPattern(path.join(cwd, 'nested/secret.pem'), '*.pem', cwd), true)
assert.equal(pathMatchesPattern(path.join(process.env.HOME, 'sandbox-test/file.txt'), '~/sandbox-test', cwd), true)
assert.equal(pathMatchesAny(path.join(cwd, 'secret.key'), ['*.pem', '*.key'], cwd), true)

const runtimeConfig = buildRuntimeConfigWithSessionGrants(
  {
    enabled: true,
    network: { allowedDomains: ['github.com'], deniedDomains: ['blocked.example'] },
    filesystem: { allowRead: ['.'], allowWrite: ['/tmp'], denyWrite: ['.env'] },
  },
  {
    domains: new Set(['iana.org']),
    readPaths: new Set(['/extra-read']),
    writePaths: new Set(['/extra-write']),
  },
)
assert.deepEqual(runtimeConfig.network.allowedDomains, ['github.com', 'iana.org'])
assert.deepEqual(runtimeConfig.network.deniedDomains, ['blocked.example'])
assert.deepEqual(runtimeConfig.filesystem.allowRead, ['.', '/extra-read'])
assert.deepEqual(runtimeConfig.filesystem.allowWrite, ['/tmp', '/extra-write'])
assert.deepEqual(runtimeConfig.filesystem.denyWrite, ['.env'])

console.log('sandbox checks ok')
