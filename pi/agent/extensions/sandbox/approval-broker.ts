import type { PermissionChoice, SandboxCtx } from './permission-ui.ts'

export type ApprovalRequest = {
  ctx: SandboxCtx
  prompt: string
  cwd: string
  values: string[]
  sessionSet: Set<string>
  persist: (target: string, values: string[]) => void
  successMessage: (target: string) => string
}

type ApprovalBrokerDependencies = {
  ask: (ctx: SandboxCtx, prompt: string) => Promise<PermissionChoice>
  getSettingsPaths: (cwd: string) => { global: string; project: string }
  refreshRuntime: (cwd: string) => Promise<void>
  createGuard?: () => () => boolean
}

export type ApprovalBroker = {
  request: (request: ApprovalRequest) => Promise<boolean>
}

export function createApprovalBroker(
  dependencies: ApprovalBrokerDependencies,
): ApprovalBroker {
  const { ask, getSettingsPaths, refreshRuntime, createGuard } = dependencies
  let queue = Promise.resolve()

  async function processRequest(options: ApprovalRequest, canProceed: () => boolean) {
    const { ctx, prompt, cwd, values, sessionSet, persist, successMessage } = options
    if (!canProceed()) return false
    const choice = await ask(ctx, prompt)
    if (!canProceed()) return false

    if (choice === 'session') {
      for (const value of values) sessionSet.add(value)
      await refreshRuntime(cwd)
      return true
    }

    if (choice !== 'project' && choice !== 'global') return false

    const paths = getSettingsPaths(cwd)
    if (!canProceed()) return false
    const target = choice === 'global' ? paths.global : paths.project
    try {
      persist(target, values)
      for (const value of values) sessionSet.add(value)
      await refreshRuntime(cwd)
      if (canProceed()) ctx.ui.notify(successMessage(target), 'info')
      return canProceed()
    } catch (err) {
      if (!canProceed()) return false
      ctx.ui.notify(
        `Failed to update sandbox config: ${err instanceof Error ? err.message : err}`,
        'error',
      )
      return false
    }
  }

  return {
    request(options) {
      const canProceed = createGuard?.() ?? (() => true)
      const result = queue.then(() => processRequest(options, canProceed))
      queue = result.then(() => undefined, () => undefined)
      return result
    },
  }
}
