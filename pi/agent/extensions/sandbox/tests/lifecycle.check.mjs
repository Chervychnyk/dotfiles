import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  RUNTIME_UNAVAILABLE_BLOCK_REASON,
  createSandboxRuntimeLifecycle,
} from '../lifecycle.ts'
import { deferred, flushMicrotasks } from './helpers.mjs'

function blockedAccess() {
  return { kind: 'blocked', reason: RUNTIME_UNAVAILABLE_BLOCK_REASON }
}

describe('sandbox runtime lifecycle', () => {
  test('blocks access while the initial runtime is initializing', async () => {
    const pending = deferred()
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => assert.fail('initialization must not reset'),
      initialize: async () => pending.promise,
    })

    const initialization = lifecycle.initialize('config')
    assert.equal(lifecycle.state, 'initializing')
    assert.deepEqual(lifecycle.access(), blockedAccess())

    const executor = { name: 'sandboxed' }
    pending.resolve(executor)
    await initialization
    assert.equal(lifecycle.state, 'ready')
    assert.deepEqual(lifecycle.access(), { kind: 'sandboxed', executor })
  })

  test('hides a stale executor throughout refresh and exposes its replacement', async () => {
    const refresh = deferred()
    let initializeCount = 0
    const events = []
    const original = { name: 'original' }
    const replacement = { name: 'replacement' }
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => events.push('reset'),
      initialize: async () => {
        initializeCount += 1
        events.push(`initialize:${initializeCount}`)
        return initializeCount === 1 ? original : refresh.promise
      },
    })

    await lifecycle.initialize('first')
    const refreshing = lifecycle.refresh('second')
    assert.equal(lifecycle.state, 'refreshing')
    assert.deepEqual(lifecycle.access(), blockedAccess())
    assert.deepEqual(events, ['initialize:1', 'reset'])

    refresh.resolve(replacement)
    await refreshing
    assert.deepEqual(events, ['initialize:1', 'reset', 'initialize:2'])
    assert.deepEqual(lifecycle.access(), { kind: 'sandboxed', executor: replacement })
  })

  test('failed initialization remains blocked without local fallback', async () => {
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => {},
      initialize: async () => {
        throw new Error('runtime failed')
      },
    })

    await assert.rejects(lifecycle.initialize('first'), /runtime failed/)
    assert.equal(lifecycle.state, 'failed')
    assert.deepEqual(lifecycle.access(), blockedAccess())
  })

  test('failed refresh discards the stale executor and remains blocked', async () => {
    let attempt = 0
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => {},
      initialize: async () => {
        attempt += 1
        if (attempt === 2) throw new Error('refresh failed')
        return { attempt }
      },
    })

    await lifecycle.initialize('first')
    await assert.rejects(lifecycle.refresh('second'), /refresh failed/)
    assert.equal(lifecycle.state, 'failed')
    assert.deepEqual(lifecycle.access(), blockedAccess())
  })

  test('retry resets a failed runtime before initializing again', async () => {
    const events = []
    let attempt = 0
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => events.push('reset'),
      initialize: async () => {
        attempt += 1
        events.push(`initialize:${attempt}`)
        if (attempt === 1) throw new Error('failed')
        return { attempt }
      },
    })

    await assert.rejects(lifecycle.initialize('first'))
    await lifecycle.refresh('second')
    assert.deepEqual(events, ['initialize:1', 'reset', 'initialize:2'])
  })

  test('only explicit local disable permits local access', () => {
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => {},
      initialize: async () => ({ name: 'sandboxed' }),
    })

    lifecycle.disable()
    assert.deepEqual(lifecycle.access(), blockedAccess())
    lifecycle.disable({ allowLocal: true })
    assert.deepEqual(lifecycle.access(), { kind: 'local' })
  })

  test('shutdown resets an initialized runtime and blocks subsequent access', async () => {
    const events = []
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => events.push('reset'),
      initialize: async () => ({ name: 'sandboxed' }),
    })

    await lifecycle.initialize('config')
    await lifecycle.shutdown()
    assert.deepEqual(events, ['reset'])
    assert.equal(lifecycle.state, 'disabled')
    assert.deepEqual(lifecycle.access(), blockedAccess())
  })

  test('pending initialization cannot publish ready after shutdown', async () => {
    const pending = deferred()
    const events = []
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => events.push('reset'),
      initialize: async () => pending.promise,
    })

    const initialization = lifecycle.initialize('config')
    const shutdown = lifecycle.shutdown()
    pending.resolve({ name: 'stale' })

    await assert.rejects(initialization, /cancelled/i)
    await shutdown
    assert.deepEqual(events, ['reset'])
    assert.equal(lifecycle.state, 'disabled')
    assert.deepEqual(lifecycle.access(), blockedAccess())
  })

  test('pending refresh cannot publish ready after shutdown', async () => {
    const pending = deferred()
    let attempt = 0
    const events = []
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => events.push('reset'),
      initialize: async () => {
        attempt += 1
        return attempt === 1 ? { name: 'original' } : pending.promise
      },
    })

    await lifecycle.initialize('first')
    const refresh = lifecycle.refresh('second')
    await flushMicrotasks()
    const shutdown = lifecycle.shutdown()
    pending.resolve({ name: 'stale replacement' })

    await assert.rejects(refresh, /cancelled/i)
    await shutdown
    assert.deepEqual(events, ['reset', 'reset'])
    assert.equal(lifecycle.state, 'disabled')
    assert.deepEqual(lifecycle.access(), blockedAccess())
  })

  test('refresh from disabled rejects instead of reviving the runtime', async () => {
    let initializeCount = 0
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => assert.fail('disabled refresh must not reset'),
      initialize: async () => {
        initializeCount += 1
        return { name: 'unexpected' }
      },
    })

    await assert.rejects(lifecycle.refresh('config'), /cannot refresh.*disabled/i)
    assert.equal(initializeCount, 0)
    assert.equal(lifecycle.state, 'disabled')
    assert.deepEqual(lifecycle.access(), blockedAccess())
  })
})
