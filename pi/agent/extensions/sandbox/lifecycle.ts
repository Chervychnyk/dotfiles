export type SandboxRuntimeState =
  | 'disabled'
  | 'initializing'
  | 'refreshing'
  | 'ready'
  | 'failed'

export const RUNTIME_UNAVAILABLE_BLOCK_REASON = 'Blocked because sandbox runtime is unavailable'

class SandboxLifecycleCancelledError extends Error {
  constructor() {
    super('Sandbox runtime operation was cancelled')
    this.name = 'SandboxLifecycleCancelledError'
  }
}

type RuntimeAccess<Executor> =
  | { kind: 'local' }
  | { kind: 'sandboxed'; executor: Executor }
  | { kind: 'blocked'; reason: string }

type LifecycleDependencies<Input, Executor> = {
  reset: () => Promise<void>
  initialize: (input: Input) => Promise<Executor>
}

export function createSandboxRuntimeLifecycle<Input, Executor>(
  dependencies: LifecycleDependencies<Input, Executor>,
) {
  let state: SandboxRuntimeState = 'disabled'
  let executor: Executor | undefined
  let allowLocal = false
  let needsReset = false
  let generation = 0
  let activeOperation: Promise<void> | undefined
  let activeToken: object | undefined
  let shuttingDown = false

  function access(): RuntimeAccess<Executor> {
    if (state === 'disabled' && allowLocal) return { kind: 'local' }
    if (state === 'ready' && executor !== undefined) {
      return { kind: 'sandboxed', executor }
    }
    return { kind: 'blocked', reason: RUNTIME_UNAVAILABLE_BLOCK_REASON }
  }

  function assertCurrent(operationGeneration: number) {
    if (operationGeneration !== generation || state === 'disabled') {
      throw new SandboxLifecycleCancelledError()
    }
  }

  function runInitialize(input: Input, nextState: 'initializing' | 'refreshing') {
    if (shuttingDown) {
      return Promise.reject(new Error(`Cannot ${nextState} while sandbox runtime is shutting down`))
    }
    if (nextState === 'refreshing' && state === 'disabled') {
      return Promise.reject(new Error('Cannot refresh sandbox runtime while disabled'))
    }

    const operationGeneration = generation
    const token = {}
    state = nextState
    executor = undefined
    allowLocal = false

    const operation = (async () => {
      try {
        if (nextState === 'refreshing' && needsReset) {
          await dependencies.reset()
          needsReset = false
          assertCurrent(operationGeneration)
        }
        needsReset = true
        const replacement = await dependencies.initialize(input)
        assertCurrent(operationGeneration)
        executor = replacement
        state = 'ready'
      } catch (error) {
        executor = undefined
        if (operationGeneration === generation && state !== 'disabled') state = 'failed'
        throw error
      } finally {
        if (activeToken === token) {
          activeToken = undefined
          activeOperation = undefined
        }
      }
    })()

    activeToken = token
    activeOperation = operation
    return operation
  }

  return {
    get state() {
      return state
    },
    access,
    createGuard() {
      const guardedGeneration = generation
      return () => generation === guardedGeneration && state === 'ready'
    },
    disable(options: { allowLocal?: boolean } = {}) {
      generation += 1
      executor = undefined
      state = 'disabled'
      allowLocal = options.allowLocal === true
    },
    initialize(input: Input) {
      return runInitialize(input, 'initializing')
    },
    refresh(input: Input) {
      return runInitialize(input, 'refreshing')
    },
    async shutdown() {
      generation += 1
      executor = undefined
      allowLocal = false
      state = 'disabled'
      shuttingDown = true
      const pendingOperation = activeOperation
      try {
        try {
          await pendingOperation
        } catch {
          // The invalidated operation is expected to reject as cancelled.
        }
        if (needsReset) await dependencies.reset()
      } finally {
        needsReset = false
        state = 'disabled'
        shuttingDown = false
      }
    },
  }
}
