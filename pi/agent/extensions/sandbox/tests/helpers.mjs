import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** A promise plus its settle functions, for driving async code from a test. */
export function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

/** Lets every already-queued microtask/promise continuation run. */
export function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

/** A real (symlink-resolved) temp directory, removed when the test ends. */
export function tempRoot(t, prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}
