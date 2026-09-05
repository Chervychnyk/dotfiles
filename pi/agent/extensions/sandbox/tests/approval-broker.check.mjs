import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createApprovalBroker } from '../approval-broker.ts'
import { createSandboxRuntimeLifecycle } from '../lifecycle.ts'
import { deferred, flushMicrotasks } from './helpers.mjs'

function createHarness(choice) {
  const events = []
  const ctx = {
    ui: {
      notify(message, level) {
        events.push(`notify:${level}:${message}`)
      },
    },
  }
  const sessionSet = new Set()
  const broker = createApprovalBroker({
    ask: async (_ctx, prompt) => {
      events.push(`ask:${prompt}`)
      return choice
    },
    getSettingsPaths: (cwd) => {
      events.push(`paths:${cwd}`)
      return {
        global: '/global/settings.json',
        project: '/project/settings.json',
      }
    },
    refreshRuntime: async (cwd) => {
      events.push(`refresh:${cwd}`)
    },
  })
  const request = () =>
    broker.request({
      ctx,
      prompt: 'Allow resource?',
      cwd: '/repo',
      values: ['resource'],
      sessionSet,
      persist(target, values) {
        events.push(`persist:${target}:${values.join(',')}`)
      },
      successMessage: (target) => `Allowed resource in ${target}`,
    })
  return { broker, ctx, events, request, sessionSet }
}

describe('approval broker', () => {
  test('returns false without changing state when approval is aborted', async () => {
    const harness = createHarness('abort')
    assert.equal(await harness.request(), false)
    assert.deepEqual(harness.events, ['ask:Allow resource?'])
    assert.deepEqual([...harness.sessionSet], [])
  })

  test('adds a session approval and refreshes the runtime', async () => {
    const harness = createHarness('session')
    assert.equal(await harness.request(), true)
    assert.deepEqual(harness.events, ['ask:Allow resource?', 'refresh:/repo'])
    assert.deepEqual([...harness.sessionSet], ['resource'])
  })

  test('serializes each complete ask, grant, and refresh sequence', async () => {
    let releaseFirstRefresh
    const firstRefreshStarted = new Promise((resolve) => {
      releaseFirstRefresh = resolve
    })
    let finishFirstRefresh
    const firstRefreshBlocked = new Promise((resolve) => {
      finishFirstRefresh = resolve
    })
    const events = []
    const broker = createApprovalBroker({
      ask: async (_ctx, prompt) => {
        events.push(`ask:${prompt}`)
        return 'session'
      },
      getSettingsPaths: () => ({ global: '', project: '' }),
      refreshRuntime: async (_cwd) => {
        events.push('refresh:start')
        releaseFirstRefresh()
        await firstRefreshBlocked
        events.push('refresh:end')
      },
    })
    const request = (prompt) =>
      broker.request({
        ctx: { ui: { notify: () => assert.fail('must not notify') } },
        prompt,
        cwd: '/repo',
        values: [prompt],
        sessionSet: new Set(),
        persist: () => assert.fail('must not persist'),
        successMessage: () => 'success',
      })

    const first = request('first')
    await firstRefreshStarted
    const second = request('second')
    await flushMicrotasks()
    assert.deepEqual(events, ['ask:first', 'refresh:start'])

    finishFirstRefresh()
    assert.deepEqual(await Promise.all([first, second]), [true, true])
    assert.deepEqual(events, [
      'ask:first',
      'refresh:start',
      'refresh:end',
      'ask:second',
      'refresh:start',
      'refresh:end',
    ])
  })

  describe('persistent approvals', () => {
    for (const [choice, target] of [
      ['project', '/project/settings.json'],
      ['global', '/global/settings.json'],
    ]) {
      test(`persists a ${choice} approval, refreshes the runtime, and notifies the user`, async () => {
        const harness = createHarness(choice)
        assert.equal(await harness.request(), true)
        assert.deepEqual(harness.events, [
          'ask:Allow resource?',
          'paths:/repo',
          `persist:${target}:resource`,
          'refresh:/repo',
          `notify:info:Allowed resource in ${target}`,
        ])
        assert.deepEqual([...harness.sessionSet], ['resource'])
      })
    }
  })

  test('shutdown cancels an approval while its prompt is pending', async () => {
    const prompt = deferred()
    const events = []
    const sessionSet = new Set()
    const lifecycle = createSandboxRuntimeLifecycle({
      reset: async () => events.push('reset'),
      initialize: async () => ({ name: 'sandboxed' }),
    })
    await lifecycle.initialize('config')
    const broker = createApprovalBroker({
      ask: async () => prompt.promise,
      getSettingsPaths: () => {
        events.push('paths')
        return { global: '/global', project: '/project' }
      },
      refreshRuntime: async () => {
        events.push('refresh')
        await lifecycle.refresh('config')
      },
      createGuard: () => lifecycle.createGuard(),
    })

    const approval = broker.request({
      ctx: { ui: { notify: () => events.push('notify') } },
      prompt: 'prompt',
      cwd: '/repo',
      values: ['resource'],
      sessionSet,
      persist: () => events.push('persist'),
      successMessage: () => 'success',
    })
    await flushMicrotasks()
    await lifecycle.shutdown()
    prompt.resolve('project')

    assert.equal(await approval, false)
    assert.deepEqual(events, ['reset'])
    assert.deepEqual([...sessionSet], [])
    assert.equal(lifecycle.state, 'disabled')
  })

  test('propagates approval prompt failures without side effects', async () => {
    const events = []
    const expected = new Error('ask failed')
    const broker = createApprovalBroker({
      ask: async () => {
        throw expected
      },
      getSettingsPaths: () => {
        events.push('paths')
        return { global: '', project: '' }
      },
      refreshRuntime: async () => {
        events.push('refresh')
      },
    })
    await assert.rejects(
      broker.request({
        ctx: { ui: { notify: () => events.push('notify') } },
        prompt: 'prompt',
        cwd: '/repo',
        values: ['resource'],
        sessionSet: new Set(),
        persist: () => events.push('persist'),
        successMessage: () => 'success',
      }),
      expected,
    )
    assert.deepEqual(events, [])
  })

  test('propagates settings path failures without persisting or refreshing', async () => {
    const harness = createHarness('project')
    const expected = new Error('paths failed')
    harness.broker = createApprovalBroker({
      ask: async () => 'project',
      getSettingsPaths: () => {
        throw expected
      },
      refreshRuntime: async () => harness.events.push('refresh'),
    })
    await assert.rejects(
      harness.broker.request({
        ctx: harness.ctx,
        prompt: 'prompt',
        cwd: '/repo',
        values: ['resource'],
        sessionSet: harness.sessionSet,
        persist: () => harness.events.push('persist'),
        successMessage: () => 'success',
      }),
      expected,
    )
    assert.deepEqual(harness.events, [])
  })

  test('reports persistence failures without adding the approval to the session', async () => {
    const harness = createHarness('project')
    const request = () =>
      harness.broker.request({
        ctx: harness.ctx,
        prompt: 'Allow resource?',
        cwd: '/repo',
        values: ['resource'],
        sessionSet: harness.sessionSet,
        persist() {
          harness.events.push('persist')
          throw new Error('disk full')
        },
        successMessage: () => 'success',
      })
    assert.equal(await request(), false)
    assert.deepEqual(harness.events, [
      'ask:Allow resource?',
      'paths:/repo',
      'persist',
      'notify:error:Failed to update sandbox config: disk full',
    ])
    assert.deepEqual([...harness.sessionSet], [])
  })

  test('reports persistent approval refresh failures after adding the session approval', async () => {
    const events = []
    const sessionSet = new Set()
    const broker = createApprovalBroker({
      ask: async () => 'project',
      getSettingsPaths: () => ({ global: '/global', project: '/project' }),
      refreshRuntime: async () => {
        events.push('refresh')
        throw 'runtime failed'
      },
    })
    const result = await broker.request({
      ctx: {
        ui: {
          notify: (message, level) => events.push(`notify:${level}:${message}`),
        },
      },
      prompt: 'prompt',
      cwd: '/repo',
      values: ['resource'],
      sessionSet,
      persist: () => events.push('persist'),
      successMessage: () => 'success',
    })
    assert.equal(result, false)
    assert.deepEqual(events, [
      'persist',
      'refresh',
      'notify:error:Failed to update sandbox config: runtime failed',
    ])
    assert.deepEqual([...sessionSet], ['resource'])
  })

  test('propagates session approval refresh failures after adding the session approval', async () => {
    const sessionSet = new Set()
    const expected = new Error('runtime failed')
    const broker = createApprovalBroker({
      ask: async () => 'session',
      getSettingsPaths: () => ({ global: '', project: '' }),
      refreshRuntime: async () => {
        throw expected
      },
    })
    await assert.rejects(
      broker.request({
        ctx: { ui: { notify: () => assert.fail('must not notify') } },
        prompt: 'prompt',
        cwd: '/repo',
        values: ['resource'],
        sessionSet,
        persist: () => assert.fail('must not persist'),
        successMessage: () => 'success',
      }),
      expected,
    )
    assert.deepEqual([...sessionSet], ['resource'])
  })
})
