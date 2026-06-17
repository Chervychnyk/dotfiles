import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { SandboxManager } from '@anthropic-ai/sandbox-runtime'
import type { BashOperations } from '@earendil-works/pi-coding-agent'

export function createSandboxedBashOps(): BashOperations {
  return {
    async exec(command, cwd, { onData, signal, timeout }) {
      if (!existsSync(cwd)) {
        throw new Error(`Working directory does not exist: ${cwd}`)
      }

      const wrappedCommand = await SandboxManager.wrapWithSandbox(command)

      // Use spawn here instead of pi.exec because the sandbox runtime wraps a
      // long-lived shell command and the bash tool expects streamed output plus
      // process-group termination on abort/timeout.
      return new Promise((resolve, reject) => {
        const child = spawn('bash', ['-c', wrappedCommand], {
          cwd,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let timedOut = false
        let settled = false
        let timeoutHandle: NodeJS.Timeout | undefined

        const killChild = () => {
          try {
            if (child.pid) process.kill(-child.pid, 'SIGKILL')
            else child.kill('SIGKILL')
          } catch {}
        }

        const clearTimeoutHandle = () => {
          if (!timeoutHandle) return
          clearTimeout(timeoutHandle)
          timeoutHandle = undefined
        }

        const cleanup = () => {
          clearTimeoutHandle()
          signal?.removeEventListener('abort', killChild)
        }

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            killChild()
          }, timeout * 1000)
          timeoutHandle.unref()
        }

        child.stdout?.on('data', onData)
        child.stderr?.on('data', onData)

        child.on('error', (err) => {
          if (settled) return
          settled = true
          cleanup()
          reject(err)
        })

        signal?.addEventListener('abort', killChild, { once: true })

        child.on('close', (code) => {
          if (settled) return
          settled = true
          cleanup()
          if (signal?.aborted) {
            reject(new Error('aborted'))
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`))
          } else {
            resolve({ exitCode: code })
          }
        })
      })
    },
  }
}
