# Ralph Wiggum Improvements Plan

Five improvements inspired by ralphi, ordered by impact. Each step is independent and can be implemented incrementally.

**Source file:** `pi/agent/extensions/ralph-wiggum.ts`

---

## Step 1: Fresh-context iterations via child sessions

**Why:** Currently each iteration reuses the same conversation. By iteration 20+, the model works with heavily compressed context and loses precision. Running each iteration in a fresh child session eliminates context degradation.

**Pi API constraint:** `newSession()`, `switchSession()`, `fork()`, and `navigateTree()` are only available on `ExtensionCommandContext` (command handlers), NOT on tool execute context.

**Pi API available (command context only):**
- `ctx.newSession({ parentSession? })` — creates a new session file, switches to it
- `ctx.switchSession(sessionPath)` — switches to an existing session file
- `ctx.sessionManager.getSessionFile()` — gets current session file path (available everywhere)

**Pi session model (from session.md):**
- Sessions are JSONL files with tree-structured entries via `id`/`parentId`
- `newSession({ parentSession })` creates a new file with `parentSession` in the header
- `session_switch` event fires after switching — available to all event handlers
- `session_start` fires when a session begins — can detect if we're resuming a loop

**Reference:** `handoff.ts:243` uses `ctx.newSession({ parentSession: parent })` from a command handler. Ralphi (`manojlds/ralphi`) uses the same approach.

**Architecture: capture command context, finalize on `turn_end`**

This is how ralphi solves the "command context only" constraint — and it's the cleanest approach:

1. When `/ralph start` (a command) runs, **capture and store the `ExtensionCommandContext`** in a module-level variable. This `ctx` has `newSession()` and `switchSession()`.
2. `ralph_done` tool does NOT create sessions. It only marks `state.status = 'awaiting_advance'` and returns immediately.
3. The **`turn_end` event handler** fires after the tool call completes. It checks for the pending advance, retrieves the **stored command context**, and uses it to call `ctx.newSession()` and `ctx.switchSession()`.
4. To prevent `session_start`/`session_switch` event handlers from interfering during programmatic session switches, use a **`suppressEventRestore` flag** that those handlers check before restoring state.

This avoids relying on the model to call a follow-up command. The session creation is fully automated and deterministic.

**Changes:**

1. Add module-level state for captured context:
   ```ts
   let commandCtx: ExtensionCommandContext | null = null  // captured from /ralph start
   let suppressEventRestore = false  // prevents event handlers from interfering during session switches
   ```

2. Add fields to `LoopState`:
   ```ts
   freshContext: boolean              // whether to use child sessions (default: false)
   controllerSessionFile?: string     // session that manages the loop lifecycle
   iterationSessionFiles?: string[]   // history of iteration session files
   pendingAdvance?: boolean           // set by ralph_done, consumed by turn_end
   ```

3. Add `--fresh-context` flag to `parseArgs` and `ralph_start` tool parameters.

4. Modify `/ralph start` command handler:
   - **Capture `ctx`**: `commandCtx = ctx`
   - If `freshContext`: record `state.controllerSessionFile = ctx.sessionManager.getSessionFile()`

5. Modify `ralph_done` tool execute:
   - If `state.freshContext`:
     - Set `state.pendingAdvance = true`, save state
     - Return tool result: `"Iteration N complete. Advancing to next iteration."`
     - Do NOT call `pi.sendUserMessage` — `turn_end` will handle it
   - If `!state.freshContext`: keep current behavior (sendUserMessage in same session)

6. Add `turn_end` event handler:
   ```ts
   pi.on('turn_end', async (_event, _ctx) => {
     if (!currentLoop || !commandCtx) return
     const state = loadState(_ctx, currentLoop)
     if (!state?.pendingAdvance || !state.freshContext) return

     state.pendingAdvance = false

     // Use stored command context for session operations
     const ctx = commandCtx

     suppressEventRestore = true
     try {
       // Switch to controller session first
       if (ctx.sessionManager.getSessionFile() !== state.controllerSessionFile) {
         await ctx.switchSession(state.controllerSessionFile!)
       }

       // Track the iteration session we're leaving
       state.iterationSessionFiles ??= []
       const prevSession = ctx.sessionManager.getSessionFile()
       if (prevSession) state.iterationSessionFiles.push(prevSession)

       // Create child session for next iteration
       await ctx.newSession({ parentSession: state.controllerSessionFile })

       saveState(ctx, state)
       updateUI(ctx)

       // Send iteration prompt in fresh session
       const content = tryRead(path.resolve(ctx.cwd, state.taskFile))
       if (!content) { endLoop(ctx, state, 'paused'); return }
       const needsReflection = shouldReflectOnCurrentIteration(state)
       pi.sendUserMessage(buildPrompt(state, content, needsReflection))
     } finally {
       suppressEventRestore = false
     }
   })
   ```

7. Guard existing `session_start` and `session_switch` event handlers:
   ```ts
   if (suppressEventRestore) return  // skip state restoration during programmatic switches
   ```

8. Modify `/ralph stop` and `/ralph-stop` commands:
   - If in an iteration session (current file !== controllerSessionFile), switch back: `ctx.switchSession(state.controllerSessionFile)`
   - Clear `commandCtx = null`

9. Clear `commandCtx` on `session_shutdown`:
   ```ts
   commandCtx = null
   ```

**Edge cases:**
- **Pi restart mid-loop**: `commandCtx` is lost. On `session_start`, detect active loop with `freshContext` and notify user to run `/ralph resume` (which re-captures `commandCtx`). The `/ralph resume` command must also capture `commandCtx = ctx`.
- **User switches session manually**: `session_before_switch` event can warn that a Ralph loop is active.

**Testing approach:** Start a loop with `--fresh-context`, let it run 3+ iterations, verify each iteration starts in a new session file (check `.pi/agent/sessions/`). Verify `/ralph stop` returns to the controller session. Test without `--fresh-context` to confirm existing behavior unchanged. Test Pi restart mid-loop to verify recovery.

---

## Step 2: Structured checklist parsing with dependency resolution

**Why:** Currently the model decides what to work on each iteration by reading the freeform task file. This is unreliable — items get skipped, repeated, or done out of order. Parsing the checklist into structured items with optional dependencies makes iteration selection deterministic.

**Changes:**

1. Add types:
   ```ts
   interface ChecklistItem {
     id: string            // auto-generated: "item-1", "item-2", ...
     text: string          // the checklist line content
     done: boolean         // parsed from [x] vs [ ]
     dependsOn?: string[]  // optional, parsed from "(after: item-1, item-3)" suffix
   }
   ```

2. Add `parseChecklist(content: string): ChecklistItem[]`:
   - Find the `## Checklist` section in the task markdown
   - Parse `- [ ] Do something (after: item-1)` lines into `ChecklistItem` objects
   - Support nested checklists (indent = sub-items of parent)
   - Assign sequential IDs

3. Add `pickNextItems(items: ChecklistItem[], count: number): ChecklistItem[]`:
   - Filter to `!done` items
   - Filter to unblocked items (all `dependsOn` items are `done`)
   - Take first `count` (or all if count=0)

4. Modify `buildPrompt` to include structured next-items:
   - Parse checklist from task file
   - Pick next items
   - Add a `## Next Items` section to the prompt listing the specific items to work on
   - If no unblocked items remain, signal completion

5. Modify `ralph_done` tool:
   - Re-parse checklist to check progress
   - If all items done, auto-complete the loop
   - Include progress summary in tool result: "Completed 5/12 items"

**Task file format stays backwards-compatible.** Existing freeform checklists work as-is (just no dependency resolution). The `(after: item-N)` syntax is opt-in.

---

## Step 3: Trajectory tracking and drift detection

**Why:** The loop has no feedback mechanism between iterations. If the model drifts off-task or gets stuck, it keeps burning iterations. Adding trajectory self-reporting lets the loop detect and react to problems.

**Changes:**

1. Add trajectory types:
   ```ts
   type Trajectory = 'on_track' | 'risk' | 'drift'
   type TrajectoryGuard = 'off' | 'warn_on_drift' | 'pause_on_drift'
   ```

2. Add fields to `LoopState`:
   ```ts
   trajectoryGuard: TrajectoryGuard  // default: 'warn_on_drift'
   trajectoryHistory: Array<{ iteration: number; trajectory: Trajectory; reason?: string }>
   consecutiveDrifts: number
   ```

3. Add `--trajectory-guard` flag to `parseArgs` and `ralph_start` tool parameters.

4. Modify `ralph_done` tool:
   - Add parameters: `trajectory: Trajectory` (required), `trajectoryReason?: string`
   - Record in `state.trajectoryHistory`
   - Track `consecutiveDrifts`
   - If guard is `warn_on_drift`: inject warning into next iteration prompt when drift detected
   - If guard is `pause_on_drift`: auto-pause the loop on 2+ consecutive drifts, notify user
   - Reset `consecutiveDrifts` on `on_track`

5. Update `buildPrompt` to include trajectory instruction:
   ```
   After completing this iteration, call ralph_done with your trajectory assessment:
   - on_track: progressing well toward the goal
   - risk: progress is slow or uncertain
   - drift: work has diverged from the task
   ```

6. Update `formatLoop` to show recent trajectory in status display.

---

## Step 4: Preflight validation on loop start

**Why:** Starting a loop with a bad task file, dirty git state, or missing prerequisites wastes iterations. Fail fast with clear errors.

**Changes:**

1. Add `validatePreflight(ctx: ExtensionContext, taskFile: string): string[]` returning a list of warnings/errors:
   - Task file exists and is non-empty
   - Task file has a `## Checklist` section with at least one unchecked item
   - Git working tree is clean (no uncommitted changes) — warning, not blocking
   - No other active Ralph loop running (currently checked, but make it part of preflight)

2. Call `validatePreflight` at the start of `commands.start` and `ralph_start` tool:
   - If errors: notify and abort
   - If warnings: notify but continue

3. Add `--force` flag to bypass warnings (not errors).

---

## Step 5: Atomic state writes

**Why:** `fs.writeFileSync` can corrupt state if the process crashes mid-write. Write-then-rename is crash-safe because rename is atomic on POSIX.

**Changes:**

1. Replace `saveState` implementation:
   ```ts
   function saveState(ctx: ExtensionContext, state: LoopState, archived = false): void {
     state.active = state.status === 'active'
     const filePath = getPath(ctx, state.name, '.state.json', archived)
     ensureDir(filePath)
     const tmpPath = filePath + '.tmp'
     fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8')
     fs.renameSync(tmpPath, filePath)
   }
   ```

2. Add recovery in `loadState`: if the main file is missing or corrupt, check for `.tmp` file as fallback.

This is a 5-line change with high reliability payoff.

---

## Implementation order

Start with **Step 5** (atomic writes, trivial) and **Step 4** (preflight, straightforward). Then **Step 3** (trajectory, moderate). Then **Step 2** (structured checklist, moderate). Finally **Step 1** (child sessions, most complex — requires understanding Pi's session lifecycle and testing edge cases around session switching).
