import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import type { ExtensionAPI, ExtensionContext, ExtensionFactory } from '@mariozechner/pi-coding-agent'
import {
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  createBashTool,
  createReadTool,
  getMarkdownTheme,
} from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { Container, Markdown, Spacer, Text } from '@mariozechner/pi-tui'

type LookupStatus = 'running' | 'done' | 'error' | 'aborted'

type LookupToolCall = {
  id: string
  name: string
  args: unknown
  isError?: boolean
}

type LookupDetails = {
  status: LookupStatus
  workspace?: string
  mode: string
  query: string
  repos: string[]
  owners: string[]
  maxSearchResults: number
  turns: number
  toolCalls: LookupToolCall[]
  summaryText?: string
  error?: string
  subagentProvider?: string
  subagentModelId?: string
  subagentThinkingLevel?: string
  subagentSelectionReason?: string
}

const DEFAULT_MAX_TURNS = 8
const DEFAULT_MAX_SEARCH_RESULTS = 20
const MAX_TOOL_CALLS_TO_KEEP = 50
const VALID_THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
const MODEL_TEMP_UNAVAILABLE_TTL_QUOTA_MS = 30 * 60 * 1000
const MODEL_TEMP_UNAVAILABLE_TTL_ERROR_MS = 10 * 60 * 1000

const GithubLookupParams = Type.Object({
  query: Type.String({ description: 'What to find in GitHub repos using gh CLI.' }),
  mode: Type.Optional(
    Type.String({
      description: 'Lookup mode: auto, code, or repo_summary.',
      default: 'auto',
    }),
  ),
  repos: Type.Optional(
    Type.Array(Type.String({ description: 'Optional owner/repo filters.' }), { maxItems: 20 }),
  ),
  owners: Type.Optional(
    Type.Array(Type.String({ description: 'Optional owner/org filters.' }), { maxItems: 20 }),
  ),
  maxSearchResults: Type.Optional(
    Type.Number({ minimum: 1, maximum: 50, default: DEFAULT_MAX_SEARCH_RESULTS }),
  ),
})

function asStringArray(value: unknown, maxItems = 20): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    out.push(trimmed)
    if (out.length >= maxItems) break
  }
  return out
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

function getLastAssistantText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role !== 'assistant') continue
    if (!Array.isArray(msg.content)) continue
    const blocks = msg.content.filter((part: any) => part?.type === 'text').map((part: any) => part.text)
    if (blocks.length > 0) return blocks.join('')
  }
  return ''
}

function formatToolCall(call: LookupToolCall): string {
  const args = call.args && typeof call.args === 'object' ? (call.args as Record<string, any>) : undefined
  if (call.name === 'read') {
    return `read ${args?.path ?? ''}`.trim()
  }
  if (call.name === 'bash') {
    const command = typeof args?.command === 'string' ? args.command.replace(/\s+/g, ' ').trim() : ''
    return `bash ${shorten(command, 100)}`.trim()
  }
  return call.name
}

type ThinkingLevel = (typeof VALID_THINKING_LEVELS)[number]
type AvailableModel = NonNullable<ExtensionContext['model']>
type ModelUnavailableReason = 'quota' | 'error'
type ModelSelectionPlan = {
  overrides: Array<{ provider: string; modelId: string; thinkingLevel: ThinkingLevel; tokenIndex: number }>
  nextOverrideIndex: number
  fallbackModel: AvailableModel | undefined
  fallbackConsumed: boolean
  envConfigured: boolean
}
type ModelSelection = {
  model: AvailableModel
  thinkingLevel?: ThinkingLevel
  reason: string
}

const temporarilyUnavailableModels = new Map<string, { untilMs: number; reason: ModelUnavailableReason }>()

function normalizeModelKey(provider: string, modelId: string): string {
  return `${provider.trim().toLowerCase()}/${modelId.trim().toLowerCase()}`
}

function getTemporarilyUnavailableState(provider: string, modelId: string) {
  const key = normalizeModelKey(provider, modelId)
  const state = temporarilyUnavailableModels.get(key)
  if (!state) return undefined
  if (state.untilMs > Date.now()) return state
  temporarilyUnavailableModels.delete(key)
  return undefined
}

function markModelTemporarilyUnavailable(model: AvailableModel, reason: ModelUnavailableReason): void {
  const ttlMs = reason === 'quota' ? MODEL_TEMP_UNAVAILABLE_TTL_QUOTA_MS : MODEL_TEMP_UNAVAILABLE_TTL_ERROR_MS
  temporarilyUnavailableModels.set(normalizeModelKey(model.provider, model.id), {
    reason,
    untilMs: Date.now() + ttlMs,
  })
}

function parseModelOverrides(rawEnvValue: string | undefined): { value: ModelSelectionPlan['overrides']; envConfigured: boolean } | { error: string } {
  if (rawEnvValue === undefined || rawEnvValue.trim() === '') return { value: [], envConfigured: false }

  const entries: ModelSelectionPlan['overrides'] = []
  for (const [index, rawToken] of rawEnvValue.split(',').entries()) {
    const token = rawToken.trim()
    if (!token) continue
    const slashIndex = token.indexOf('/')
    const thinkingIndex = token.lastIndexOf(':')
    if (slashIndex <= 0 || thinkingIndex <= slashIndex + 1 || thinkingIndex === token.length - 1) {
      return { error: `Invalid PI_GITHUB_LOOKUP_MODELS token #${index + 1}: ${rawToken}` }
    }

    const provider = token.slice(0, slashIndex).trim()
    const modelId = token.slice(slashIndex + 1, thinkingIndex).trim()
    const thinkingLevel = token.slice(thinkingIndex + 1).trim().toLowerCase() as ThinkingLevel
    if (!VALID_THINKING_LEVELS.includes(thinkingLevel)) {
      return { error: `Invalid PI_GITHUB_LOOKUP_MODELS thinking level in token #${index + 1}: ${rawToken}` }
    }

    entries.push({ provider, modelId, thinkingLevel, tokenIndex: index + 1 })
  }

  return { value: entries, envConfigured: true }
}

function matchAvailableModel(availableModels: AvailableModel[], provider: string, modelId: string): AvailableModel | undefined {
  const providerNorm = provider.toLowerCase()
  const modelIdNorm = modelId.toLowerCase()
  return availableModels.find(
    (candidate) => candidate.provider.toLowerCase() === providerNorm && candidate.id.toLowerCase() === modelIdNorm,
  )
}

function createModelSelectionPlan(currentModel: ExtensionContext['model']): { plan: ModelSelectionPlan | null; error?: string } {
  const parsed = parseModelOverrides(process.env.PI_GITHUB_LOOKUP_MODELS)
  if ('error' in parsed) return { plan: null, error: parsed.error }

  return {
    plan: {
      overrides: parsed.value,
      nextOverrideIndex: 0,
      fallbackModel: currentModel ?? undefined,
      fallbackConsumed: false,
      envConfigured: parsed.envConfigured,
    },
  }
}

function getNextLookupModel(plan: ModelSelectionPlan, modelRegistry: ExtensionContext['modelRegistry']): ModelSelection | null {
  const availableModels = modelRegistry.getAvailable() as AvailableModel[]

  while (plan.nextOverrideIndex < plan.overrides.length) {
    const entry = plan.overrides[plan.nextOverrideIndex++]
    const matched = matchAvailableModel(availableModels, entry.provider, entry.modelId)
    if (!matched) continue
    if (getTemporarilyUnavailableState(matched.provider, matched.id)) continue
    return {
      model: matched,
      thinkingLevel: entry.thinkingLevel,
      reason: `PI_GITHUB_LOOKUP_MODELS token #${entry.tokenIndex}: ${matched.provider}/${matched.id}:${entry.thinkingLevel}`,
    }
  }

  if (plan.fallbackConsumed) return null
  plan.fallbackConsumed = true
  if (!plan.fallbackModel) return null

  const fallbackMatched = matchAvailableModel(availableModels, plan.fallbackModel.provider, plan.fallbackModel.id)
  if (!fallbackMatched) return null
  if (getTemporarilyUnavailableState(fallbackMatched.provider, fallbackMatched.id)) return null

  return {
    model: fallbackMatched,
    reason: plan.envConfigured
      ? `ctx.model fallback after PI_GITHUB_LOOKUP_MODELS filtering: ${fallbackMatched.provider}/${fallbackMatched.id}`
      : `ctx.model fallback (PI_GITHUB_LOOKUP_MODELS unset/blank): ${fallbackMatched.provider}/${fallbackMatched.id}`,
  }
}

function isQuotaError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return msg.includes('rate limit') || msg.includes('quota') || msg.includes('429') || msg.includes('billing')
}

function looksLikeSilentModelFailure(summaryText: string | undefined, toolCalls: LookupToolCall[]): boolean {
  return toolCalls.length === 0 && (!summaryText || summaryText === '(no output)')
}

function createTurnBudgetExtension(maxTurns: number): ExtensionFactory {
  return (pi) => {
    let turnIndex = 0

    pi.on('turn_start', async (event) => {
      turnIndex = event.turnIndex
    })

    pi.on('tool_call', async () => {
      if (turnIndex < maxTurns - 1) return undefined
      return {
        block: true,
        reason: `Tool use is disabled on the final turn (${turnIndex + 1}/${maxTurns}). Give the final answer now.`,
      }
    })
  }
}

function buildSystemPrompt(maxTurns: number, workspace: string, defaultLimit: number): string {
  return `You are GitHub Lookup, an evidence-first GitHub research scout.
You operate in an isolated workspace and may only use the provided tools (bash/read).
Use gh commands directly. Do not clone repositories unless explicitly requested.
Keep workspace changes under repos/<owner>/<repo>/... only.
Never treat gh search snippets as final proof; fetch the needed file before making code-content claims.
Keep answers concise, path-first, and citation-heavy.

Workspace: ${workspace}
Default gh search limit: ${defaultLimit}
Turn budget: at most ${maxTurns} turns total.

Useful gh patterns:
- Resolve default branch:
  gh repo view OWNER/REPO --json defaultBranchRef --jq '.defaultBranchRef.name'
- Code search:
  gh search code 'QUERY' --json path,repository,sha,url,textMatches --limit ${defaultLimit}
  Add --repo owner/repo and/or --owner owner when scope is known.
- Tree listing:
  gh api "repos/OWNER/REPO/git/trees/REF?recursive=1"
- Root contents:
  gh api "repos/OWNER/REPO/contents?ref=REF" --jq '.[] | [.type, .path] | @tsv'
- Fetch one file into cache:
  mkdir -p "repos/OWNER/REPO/$(dirname FILE)"
  gh api "repos/OWNER/REPO/contents/FILE?ref=REF" --jq .content | tr -d '\n' | base64 --decode > "repos/OWNER/REPO/FILE"
- Search cached files locally:
  rg -n 'pattern' repos/OWNER/REPO

Repo summary heuristics (apply when useful, especially in repo_summary mode):
- First inspect root contents and identify likely stack markers before broad searching.
- Rails/Ruby markers: Gemfile, Gemfile.lock, .ruby-version, bin/rails, config/application.rb, config/routes.rb, app/, lib/, spec/.
- Python markers: pyproject.toml, requirements.txt, uv.lock, poetry.lock, manage.py, app/, src/, tests/.
- Node markers: package.json, pnpm-lock.yaml, yarn.lock, turbo.json, nx.json, apps/, packages/, src/, test/.
- Docker/ops markers: compose.yml, compose.yaml, docker-compose.yml, Dockerfile, .github/workflows/, .gitlab-ci.yml, Procfile.
- For repo summaries, prioritize: stack/runtime, test framework, lint/build tooling, container/deploy clues, job/worker clues, and likely app entrypoints.
- Prefer fetching a small set of canonical files (README, package manifests, Docker/CI files, main app entrypoints) over many speculative files.

Output format:
## Summary
## Locations
## Evidence
## Searched (only if incomplete)
## Next steps (optional)
`.trim()
}

function buildUserPrompt(
  mode: string,
  query: string,
  repos: string[],
  owners: string[],
  maxSearchResults: number,
): string {
  const modeInstructions =
    mode === 'repo_summary'
      ? 'Primary goal: summarize repo structure, stack, runtime, test setup, Docker/CI usage, and key entrypoints.'
      : mode === 'code'
        ? 'Primary goal: locate exact code paths/files/snippets answering the query.'
        : 'Choose the most efficient GitHub investigation workflow based on the query.'

  return `Task: investigate GitHub using gh and answer the query.
${modeInstructions}

Query: ${query}
Repository filters: ${repos.length > 0 ? repos.join(', ') : '(none)'}
Owner filters: ${owners.length > 0 ? owners.join(', ') : '(none)'}
Max search results per gh search call: ${maxSearchResults}
Always pass --limit ${maxSearchResults} to gh search code unless a tighter limit is enough.

Important:
- prefer scoped searches when repos/owners are known
- fetch only the files needed to support the answer
- cite cached local files for code-content claims
- mention access/auth limitations clearly if gh returns 403/404`.trim()
}

export default function githubLookupExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'github_lookup',
    label: 'GitHub Lookup',
    description: 'Investigate GitHub repositories with gh CLI in an isolated workspace using a focused subagent.',
    promptSnippet: 'Investigate GitHub repos with gh CLI when the answer likely lives outside the current repository',
    promptGuidelines: [
      'Use this tool for GitHub repo investigation, code search, repository structure lookup, and PR-style reconnaissance.',
      'Prefer this tool over ad-hoc bash when exploring external repos or private repos accessible via gh auth.',
    ],
    parameters: GithubLookupParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      const query = typeof (params as any).query === 'string' ? (params as any).query.trim() : ''
      if (!query) {
        return {
          content: [{ type: 'text', text: 'Invalid parameters: query must be a non-empty string.' }],
          details: { status: 'error', mode: 'auto', query: '', repos: [], owners: [], maxSearchResults: DEFAULT_MAX_SEARCH_RESULTS, turns: 0, toolCalls: [] } satisfies LookupDetails,
          isError: true,
        }
      }

      const mode = ['auto', 'code', 'repo_summary'].includes(String((params as any).mode || 'auto'))
        ? String((params as any).mode || 'auto')
        : 'auto'
      const repos = asStringArray((params as any).repos)
      const owners = asStringArray((params as any).owners)
      const maxSearchResults = clampNumber((params as any).maxSearchResults, 1, 50, DEFAULT_MAX_SEARCH_RESULTS)

      const ghVersion = await pi.exec('gh', ['--version'], { timeout: 10_000 }).catch(() => null)
      if (!ghVersion || ghVersion.code !== 0) {
        const error = 'GitHub CLI `gh` is not available. Install it and authenticate with `gh auth login`.'
        return {
          content: [{ type: 'text', text: error }],
          details: { status: 'error', mode, query, repos, owners, maxSearchResults, turns: 0, toolCalls: [], error } satisfies LookupDetails,
          isError: true,
        }
      }

      const workspaceBase = '/tmp/pi-github-lookup'
      await fs.mkdir(workspaceBase, { recursive: true })
      const workspace = await fs.mkdtemp(path.join(workspaceBase, 'run-'))
      await fs.mkdir(path.join(workspace, 'repos'), { recursive: true })

      const details: LookupDetails = {
        status: 'running',
        workspace,
        mode,
        query,
        repos,
        owners,
        maxSearchResults,
        turns: 0,
        toolCalls: [],
      }

      const emit = (forceText?: string) => {
        onUpdate?.({
          content: [{ type: 'text', text: forceText ?? details.summaryText ?? '(searching GitHub...)' }],
          details,
        })
      }

      emit('(starting GitHub lookup...)')

      try {
        const planResult = createModelSelectionPlan(ctx.model)
        if (!planResult.plan) {
          const error = planResult.error ?? 'Failed to parse PI_GITHUB_LOOKUP_MODELS.'
          details.status = 'error'
          details.error = error
          details.summaryText = error
          emit(error)
          return {
            content: [{ type: 'text', text: error }],
            details,
            isError: true,
          }
        }

        const resourceLoader = new DefaultResourceLoader({
          noExtensions: true,
          noSkills: true,
          noPromptTemplates: true,
          noThemes: true,
          extensionFactories: [createTurnBudgetExtension(DEFAULT_MAX_TURNS)],
          systemPromptOverride: () => buildSystemPrompt(DEFAULT_MAX_TURNS, workspace, maxSearchResults),
          skillsOverride: () => ({ skills: [], diagnostics: [] }),
        })

        await resourceLoader.reload()

        let selection = getNextLookupModel(planResult.plan, ctx.modelRegistry)
        if (!selection) {
          const error = 'No model candidates available for github_lookup. Configure PI_GITHUB_LOOKUP_MODELS or ensure ctx.model is available.'
          details.status = 'error'
          details.error = error
          details.summaryText = error
          emit(error)
          return {
            content: [{ type: 'text', text: error }],
            details,
            isError: true,
          }
        }

        let lastFailure = ''

        while (selection) {
          details.subagentProvider = selection.model.provider
          details.subagentModelId = selection.model.id
          details.subagentThinkingLevel = selection.thinkingLevel ?? 'medium'
          details.subagentSelectionReason = selection.reason
          details.toolCalls = []
          details.turns = 0
          details.summaryText = '(searching GitHub...)'
          emit()

          const { session } = await createAgentSession({
            cwd: workspace,
            modelRegistry: ctx.modelRegistry,
            sessionManager: SessionManager.inMemory(workspace),
            model: selection.model,
            thinkingLevel: selection.thinkingLevel ?? 'medium',
            tools: [createReadTool(workspace), createBashTool(workspace)],
            resourceLoader,
          })

          const unsubscribe = session.subscribe((event: any) => {
            switch (event.type) {
              case 'turn_end':
                details.turns += 1
                emit()
                break
              case 'tool_execution_start':
                details.toolCalls.push({
                  id: event.toolCallId,
                  name: event.toolName,
                  args: event.args,
                })
                if (details.toolCalls.length > MAX_TOOL_CALLS_TO_KEEP) {
                  details.toolCalls.splice(0, details.toolCalls.length - MAX_TOOL_CALLS_TO_KEEP)
                }
                emit()
                break
              case 'tool_execution_end': {
                const call = details.toolCalls.find((item) => item.id === event.toolCallId)
                if (call) call.isError = event.isError
                emit()
                break
              }
            }
          })

          const abortLookup = () => {
            void session.abort().catch(() => {})
          }

          if (signal) {
            if (signal.aborted) {
              abortLookup()
            } else {
              signal.addEventListener('abort', abortLookup, { once: true })
            }
          }

          try {
            if (signal?.aborted) {
              details.status = 'aborted'
              details.summaryText = 'Aborted'
              emit(details.summaryText)
              return {
                content: [{ type: 'text', text: details.summaryText }],
                details,
                isError: false,
              }
            }

            await session.prompt(buildUserPrompt(mode, query, repos, owners, maxSearchResults), {
              expandPromptTemplates: false,
            })
            details.summaryText = getLastAssistantText((session.state as any).messages ?? []).trim() || '(no output)'

            if (looksLikeSilentModelFailure(details.summaryText, details.toolCalls)) {
              throw new Error('Model produced no output and made no tool calls.')
            }

            if (signal?.aborted) {
              details.status = 'aborted'
              details.summaryText = 'Aborted'
              emit(details.summaryText)
              return {
                content: [{ type: 'text', text: details.summaryText }],
                details,
                isError: false,
              }
            }

            details.status = 'done'
            emit(details.summaryText)

            return {
              content: [{ type: 'text', text: details.summaryText ?? '(no output)' }],
              details,
              isError: false,
            }
          } catch (error) {
            if (signal?.aborted) {
              details.status = 'aborted'
              details.summaryText = 'Aborted'
              emit(details.summaryText)
              return {
                content: [{ type: 'text', text: details.summaryText }],
                details,
                isError: false,
              }
            }

            lastFailure = error instanceof Error ? error.message : String(error)
            markModelTemporarilyUnavailable(selection.model, isQuotaError(error) ? 'quota' : 'error')
            selection = getNextLookupModel(planResult.plan, ctx.modelRegistry)
            if (!selection) {
              details.status = 'error'
              details.error = lastFailure
              details.summaryText = `github_lookup failed after model fallback attempts: ${lastFailure}`
              emit(details.summaryText)
              return {
                content: [{ type: 'text', text: details.summaryText }],
                details,
                isError: true,
              }
            }
          } finally {
            if (signal) signal.removeEventListener('abort', abortLookup)
            unsubscribe()
            session.dispose()
          }
        }

        details.status = 'error'
        details.error = lastFailure || 'github_lookup failed without a model attempt.'
        details.summaryText = details.error
        emit(details.summaryText)
        return {
          content: [{ type: 'text', text: details.summaryText }],
          details,
          isError: true,
        }
      } catch (error) {
        details.status = signal?.aborted ? 'aborted' : 'error'
        details.error = error instanceof Error ? error.message : String(error)
        details.summaryText = details.error
        emit(details.summaryText)
        return {
          content: [{ type: 'text', text: details.summaryText }],
          details,
          isError: details.status === 'error',
        }
      }
    },
    renderCall(args, theme) {
      const query = typeof (args as any)?.query === 'string' ? (args as any).query.trim() : ''
      const mode = String((args as any)?.mode || 'auto')
      const scope = `repos:${Array.isArray((args as any)?.repos) ? (args as any).repos.length : 0} owners:${Array.isArray((args as any)?.owners) ? (args as any).owners.length : 0}`
      const text = `${theme.fg('toolTitle', theme.bold('github_lookup '))}${theme.fg('accent', `[${mode}] `)}${theme.fg('muted', scope)}${query ? theme.fg('text', ` · ${shorten(query, 80)}`) : ''}`
      return new Text(text, 0, 0)
    },
    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as LookupDetails | undefined
      if (!details) {
        const text = result.content[0]
        return new Text(text?.type === 'text' ? text.text : '(no output)', 0, 0)
      }

      const status = isPartial ? 'running' : details.status
      const icon =
        status === 'done'
          ? theme.fg('success', '✓')
          : status === 'error'
            ? theme.fg('error', '✗')
            : status === 'aborted'
              ? theme.fg('warning', '◼')
              : theme.fg('warning', '⏳')

      const modelLabel = details.subagentProvider && details.subagentModelId
        ? `${details.subagentProvider}/${details.subagentModelId}:${details.subagentThinkingLevel ?? 'medium'}`
        : 'model: ?'
      const header = `${icon} ${theme.fg('toolTitle', theme.bold('github_lookup '))}${theme.fg('dim', `${details.mode} • ${modelLabel} • ${details.turns} turns • ${details.toolCalls.length} tool calls`)}`
      const workspaceLine = details.workspace
        ? `${theme.fg('muted', 'workspace: ')}${theme.fg('toolOutput', details.workspace)}`
        : theme.fg('muted', 'workspace: (none)')
      const selectionLine = details.subagentSelectionReason
        ? `${theme.fg('muted', 'selection: ')}${theme.fg('toolOutput', details.subagentSelectionReason)}`
        : ''

      let toolsText = ''
      if (details.toolCalls.length > 0) {
        const calls = expanded ? details.toolCalls : details.toolCalls.slice(-6)
        const lines = [theme.fg('muted', 'Tools:')]
        for (const call of calls) {
          const callIcon = call.isError ? theme.fg('error', '✗') : theme.fg('dim', '→')
          lines.push(`${callIcon} ${theme.fg('toolOutput', formatToolCall(call))}`)
        }
        if (!expanded && details.toolCalls.length > 6) lines.push(theme.fg('muted', '(Ctrl+O to expand)'))
        toolsText = lines.join('\n')
      }

      const combined = (result.content[0]?.type === 'text' ? result.content[0].text : details.summaryText || '(no output)').trim() || '(no output)'

      if (!expanded) {
        const preview = combined.split('\n').slice(0, 18).join('\n')
        let text = `${header}\n${workspaceLine}${selectionLine ? `\n${selectionLine}` : ''}\n\n${theme.fg('toolOutput', preview)}`
        if (combined.split('\n').length > 18) text += `\n${theme.fg('muted', '(Ctrl+O to expand)')}`
        if (toolsText) text += `\n\n${toolsText}`
        return new Text(text, 0, 0)
      }

      const container = new Container()
      container.addChild(new Text(header, 0, 0))
      container.addChild(new Text(workspaceLine, 0, 0))
      if (selectionLine) container.addChild(new Text(selectionLine, 0, 0))
      if (toolsText) {
        container.addChild(new Spacer(1))
        container.addChild(new Text(toolsText, 0, 0))
      }
      container.addChild(new Spacer(1))
      container.addChild(new Markdown(combined, 0, 0, getMarkdownTheme()))
      return container
    },
  })
}
