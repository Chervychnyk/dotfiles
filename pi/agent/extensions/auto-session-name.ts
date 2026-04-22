/**
 * Auto Session Name Extension
 *
 * Sets an immediate temporary name from the first user message, then upgrades it
 * once when enough session context becomes available. Auto-name state is
 * persisted so resumed and reloaded sessions can still perform the upgrade.
 */
import { completeSimple, type Api, type Model } from '@mariozechner/pi-ai'
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionContext,
  SessionEntry,
} from '@mariozechner/pi-coding-agent'

const CUSTOM_STATE_TYPE = 'auto-session-name'
const STATE_VERSION = 1
const MAX_SESSION_NAME_CHARS = 120
const MAX_SUMMARY_CONTEXT_CHARS = 1800
const MIN_ASSISTANT_CHARS = 500
const MIN_ASSISTANT_CHARS_WITH_TOOLS = 180
const MIN_USER_TURNS = 3

const skillPattern = /^\/skill:(\S+)\s*([\s\S]*)/i
const subagentPattern = /^\/subagent\s+(\S+)\s*([\s\S]*)/i
const commandPattern = /^\/([a-z0-9:_-]+)\b\s*([\s\S]*)/i
const prefixPattern = /^\[[^\]]+\]\s*/

const SUMMARY_PROMPT = `You are naming a coding session.
Generate a short, specific session title based on the first request and the current session context.
Rules:
- 5 to 10 words preferred
- describe the actual task or intended outcome, not generic phrasing
- include the most specific nouns available (feature, file, subsystem, bug, command, integration)
- no quotes
- no markdown
- no trailing punctuation
- use sentence case
- return title text only`

type PersistedState = {
  version: 1
  stage: 'temp' | 'final' | 'external'
  firstUserText: string
  firstPromptBody: string
  prefix: string
  autoName: string
}

type RuntimeState = {
  stage: 'idle' | 'temp' | 'final' | 'external'
  firstUserText: string
  firstPromptBody: string
  prefix: string
  autoName: string
  generating: boolean
}

type SeedInfo = {
  rawText: string
  promptBody: string
  prefix: string
}

type SummarySignals = {
  userTurns: number
  assistantChars: number
  toolCallCount: number
  assistantExcerpt: string
  latestUserText: string
  toolNames: string[]
}

type SummaryModel = {
  model: Model<Api>
  apiKey?: string
  headers?: Record<string, string>
}

function createEmptyState(): RuntimeState {
  return {
    stage: 'idle',
    firstUserText: '',
    firstPromptBody: '',
    prefix: '',
    autoName: '',
    generating: false,
  }
}

function collapsePaths(text: string): string {
  return text.replace(
    /(?:^|\s)(?:\.{0,2}\/)?(?:[\w.-]+\/)+([\w.-]+)/g,
    (_match, tail: string) => ` ${tail}`,
  )
}

function truncateTitle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text

  const sentenceEnd = text.slice(0, maxChars + 5).search(/[.!?]\s/)
  if (sentenceEnd > 15 && sentenceEnd <= maxChars) {
    return text.slice(0, sentenceEnd + 1).trim()
  }

  const truncated = text.slice(0, maxChars)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated).trim()
}

function normalizeTitleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function sanitizeTitleText(text: string): string {
  return normalizeTitleText(collapsePaths(text))
}

function cleanSessionName(text: string): string {
  const cleaned = sanitizeTitleText(text)
  const base = cleaned.length >= 5 ? cleaned : normalizeTitleText(text)
  const trimmed = base.replace(/[\s:;,.-]+$/g, '').trim()

  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : ''
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .filter(
      (block): block is { type: string; text?: string } =>
        !!block && typeof block === 'object' && 'type' in block,
    )
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractToolCallNames(content: unknown): string[] {
  if (!Array.isArray(content)) return []

  return content
    .filter(
      (block): block is { type: string; name?: string } =>
        !!block && typeof block === 'object' && 'type' in block,
    )
    .filter(
      (block) => block.type === 'toolCall' && typeof block.name === 'string',
    )
    .map((block) => block.name ?? '')
    .filter(Boolean)
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripPrefix(title: string): string {
  return title.replace(prefixPattern, '')
}

function isMeaningfullyDifferent(current: string, next: string): boolean {
  const a = normalizeForComparison(stripPrefix(current))
  const b = normalizeForComparison(stripPrefix(next))
  if (!a || !b) return false
  return a !== b
}

function preservePrefix(prefix: string, title: string): string {
  const cleaned = cleanSessionName(title)
  const maxTitleChars = Math.max(72, MAX_SESSION_NAME_CHARS - prefix.length)
  return `${prefix}${truncateTitle(cleaned, maxTitleChars)}`.trim()
}

function parseSeed(text: string): SeedInfo {
  const trimmed = text.trim()

  const skillMatch = trimmed.match(skillPattern)
  if (skillMatch) {
    return {
      rawText: trimmed,
      promptBody: skillMatch[2].trim() || skillMatch[1],
      prefix: `[${skillMatch[1].toLowerCase()}] `,
    }
  }

  const subagentMatch = trimmed.match(subagentPattern)
  if (subagentMatch) {
    return {
      rawText: trimmed,
      promptBody: subagentMatch[2].trim() || subagentMatch[1],
      prefix: `[${subagentMatch[1].toLowerCase()}] `,
    }
  }

  const commandMatch = trimmed.match(commandPattern)
  if (commandMatch) {
    return {
      rawText: trimmed,
      promptBody: commandMatch[2].trim() || commandMatch[1],
      prefix: `[${commandMatch[1].toLowerCase()}] `,
    }
  }

  return {
    rawText: trimmed,
    promptBody: trimmed,
    prefix: '',
  }
}

function buildAutoName(
  firstPromptBody: string,
  firstUserText: string,
  prefix: string,
): string {
  return preservePrefix(prefix, firstPromptBody || firstUserText)
}

function applySeed(state: RuntimeState, seed: SeedInfo) {
  state.firstUserText = seed.rawText
  state.firstPromptBody = seed.promptBody
  state.prefix = seed.prefix
}

function snapshotState(state: RuntimeState): PersistedState | null {
  if (state.stage === 'idle') return null
  if (!state.firstUserText && !state.autoName) return null

  return {
    version: STATE_VERSION,
    stage: state.stage,
    firstUserText: state.firstUserText,
    firstPromptBody: state.firstPromptBody,
    prefix: state.prefix,
    autoName: state.autoName,
  }
}

function persistState(pi: ExtensionAPI, state: RuntimeState) {
  const snapshot = snapshotState(state)
  if (!snapshot) return
  pi.appendEntry(CUSTOM_STATE_TYPE, snapshot)
}

function readPersistedState(entry: SessionEntry): PersistedState | null {
  if (entry.type !== 'custom' || entry.customType !== CUSTOM_STATE_TYPE)
    return null
  if (!entry.data || typeof entry.data !== 'object') return null

  const data = entry.data as Record<string, unknown>
  if (data.version !== STATE_VERSION) return null
  if (
    data.stage !== 'temp' &&
    data.stage !== 'final' &&
    data.stage !== 'external'
  )
    return null

  return {
    version: STATE_VERSION,
    stage: data.stage,
    firstUserText:
      typeof data.firstUserText === 'string' ? data.firstUserText : '',
    firstPromptBody:
      typeof data.firstPromptBody === 'string' ? data.firstPromptBody : '',
    prefix: typeof data.prefix === 'string' ? data.prefix : '',
    autoName: typeof data.autoName === 'string' ? data.autoName : '',
  }
}

function loadPersistedState(ctx: {
  sessionManager: {
    getBranch: () => SessionEntry[]
    getEntries: () => SessionEntry[]
  }
}): PersistedState | null {
  let latest: PersistedState | null = null
  const entries =
    ctx.sessionManager.getBranch?.() ?? ctx.sessionManager.getEntries()

  for (const entry of entries) {
    const restored = readPersistedState(entry)
    if (restored) latest = restored
  }

  return latest
}

function getSessionMessages(ctx: {
  sessionManager: { buildSessionContext: () => SessionContext }
}): SessionContext['messages'] {
  return ctx.sessionManager.buildSessionContext().messages
}

function firstUserSeed(messages: SessionContext['messages']): SeedInfo | null {
  for (const message of messages) {
    if (message.role !== 'user') continue
    const text = extractText(message.content).trim()
    if (!text) continue
    return parseSeed(text)
  }
  return null
}

function collectSummarySignals(
  messages: SessionContext['messages'],
): SummarySignals {
  const userTexts = messages
    .filter((message) => message.role === 'user')
    .map((message) => extractText(message.content))
    .filter(Boolean)

  const assistantMessages = messages.filter(
    (message) => message.role === 'assistant',
  )
  const assistantTexts = assistantMessages
    .map((message) => extractText(message.content))
    .filter(Boolean)

  const assistantChars = assistantTexts.reduce(
    (total, text) => total + text.length,
    0,
  )
  const assistantExcerpt = assistantTexts
    .join('\n\n')
    .slice(-MAX_SUMMARY_CONTEXT_CHARS)
    .trim()

  const toolNames = assistantMessages
    .flatMap((message) => extractToolCallNames(message.content))
    .filter((name, index, list) => list.indexOf(name) === index)

  const toolCallCount = assistantMessages.reduce((total, message) => {
    return total + extractToolCallNames(message.content).length
  }, 0)

  return {
    userTurns: userTexts.length,
    assistantChars,
    toolCallCount,
    assistantExcerpt,
    latestUserText: userTexts.length > 0 ? userTexts[userTexts.length - 1] : '',
    toolNames,
  }
}

function hasManualOverride(currentName: string, autoName: string): boolean {
  if (!currentName || !autoName) return false
  return (
    normalizeForComparison(currentName) !== normalizeForComparison(autoName)
  )
}

function shouldSummarize(
  state: RuntimeState,
  signals: SummarySignals,
): boolean {
  if (!state.firstUserText) return false
  if (state.generating) return false
  if (state.stage !== 'temp') return false

  const hasToolUse = signals.toolCallCount > 0
  if (state.prefix.length > 0) {
    return signals.assistantChars > 0 || hasToolUse || signals.userTurns >= 2
  }

  return (
    signals.assistantChars >= MIN_ASSISTANT_CHARS ||
    signals.userTurns >= MIN_USER_TURNS ||
    (hasToolUse && signals.assistantChars >= MIN_ASSISTANT_CHARS_WITH_TOOLS)
  )
}

function buildSummaryInput(
  state: RuntimeState,
  signals: SummarySignals,
): string {
  return [
    `First request:\n${state.firstPromptBody || state.firstUserText}`,
    `Current title:\n${state.autoName || buildAutoName(state.firstPromptBody, state.firstUserText, state.prefix)}`,
    `Latest user turn:\n${signals.latestUserText || '(same as first request)'}`,
    `Tools used:\n${signals.toolNames.length > 0 ? signals.toolNames.join(', ') : 'none'}`,
    `Recent assistant context:\n${signals.assistantExcerpt || '(none yet)'}`,
  ].join('\n\n')
}

async function pickSummaryModel(ctx: {
  model: Model<Api> | undefined
  modelRegistry: {
    find: (provider: string, modelId: string) => Model<Api> | undefined
    getApiKeyAndHeaders: (
      model: Model<Api>,
    ) => Promise<
      | { ok: true; apiKey?: string; headers?: Record<string, string> }
      | { ok: false; error: string }
    >
  }
}): Promise<SummaryModel | null> {
  // Prefer the current model to avoid auth/provider mismatches, then fall back
  // to small/cheap summarizer models if they're available.
  const preferred = [
    ctx.model,
    ctx.modelRegistry.find('openai-codex', 'gpt-5.4-mini'),
    ctx.modelRegistry.find('anthropic', 'claude-haiku-4-5'),
  ].filter(Boolean) as Model<Api>[]

  const seen = new Set<string>()

  for (const model of preferred) {
    const key = `${model.provider}:${model.id}`
    if (seen.has(key)) continue
    seen.add(key)

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model)
    if (auth.ok) {
      return { model, apiKey: auth.apiKey, headers: auth.headers }
    }
  }

  return null
}

function buildFallbackSummaryName(
  state: RuntimeState,
  signals: SummarySignals,
): string {
  const candidate =
    signals.latestUserText || state.firstPromptBody || state.firstUserText
  return preservePrefix(state.prefix, candidate)
}

function applySessionName(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  name: string,
) {
  pi.setSessionName(name)
  ctx.ui.setTitle(name)
}

function restoreState(
  existingName: string,
  persisted: PersistedState | null,
  seed: SeedInfo | null,
): RuntimeState {
  const state = createEmptyState()

  if (seed) {
    applySeed(state, seed)
  }

  if (persisted) {
    state.stage = persisted.stage
    state.firstUserText = persisted.firstUserText || state.firstUserText
    state.firstPromptBody = persisted.firstPromptBody || state.firstPromptBody
    state.prefix = persisted.prefix || state.prefix
    state.autoName = persisted.autoName

    if (existingName) {
      if (hasManualOverride(existingName, persisted.autoName)) {
        state.stage = 'external'
      }
      state.autoName = existingName
    }

    return state
  }

  if (!seed) {
    if (existingName) {
      state.stage = 'external'
      state.autoName = existingName
    }
    return state
  }

  const derivedAutoName = buildAutoName(
    state.firstPromptBody,
    state.firstUserText,
    state.prefix,
  )
  if (!existingName) {
    state.stage = 'temp'
    state.autoName = derivedAutoName
    return state
  }

  if (
    normalizeForComparison(existingName) ===
    normalizeForComparison(derivedAutoName)
  ) {
    state.stage = 'temp'
    state.autoName = existingName
    return state
  }

  state.stage = 'external'
  state.autoName = existingName
  return state
}

export default function (pi: ExtensionAPI) {
  let state = createEmptyState()
  let summaryModelPromise: Promise<SummaryModel | null> | null = null

  pi.on('session_start', async (_event, ctx) => {
    summaryModelPromise = null

    const existingName = pi.getSessionName() ?? ''
    const persisted = loadPersistedState(ctx)
    const messages = getSessionMessages(ctx)
    const seed = firstUserSeed(messages)

    state = restoreState(existingName, persisted, seed)

    if (!existingName && state.stage !== 'external' && state.autoName) {
      applySessionName(pi, ctx, state.autoName)
      persistState(pi, state)
      return
    }

    if (existingName) {
      ctx.ui.setTitle(existingName)
    }

    if (persisted && state.stage !== persisted.stage) {
      persistState(pi, state)
    }
  })

  pi.on('input', async (event, ctx) => {
    if (event.source === 'extension') return
    if (state.stage !== 'idle') return

    const text = event.text.trim()
    if (!text) return

    const seed = parseSeed(text)
    applySeed(state, seed)

    const name = buildAutoName(
      state.firstPromptBody,
      state.firstUserText,
      state.prefix,
    )
    if (!name) return

    state.stage = 'temp'
    state.autoName = name
    applySessionName(pi, ctx, name)
    persistState(pi, state)
  })

  pi.on('agent_end', async (_event, ctx) => {
    if (!state.firstUserText || state.generating || state.stage === 'external')
      return

    const currentName = pi.getSessionName() ?? ''
    if (currentName && hasManualOverride(currentName, state.autoName)) {
      state.stage = 'external'
      state.autoName = currentName
      persistState(pi, state)
      return
    }

    const messages = getSessionMessages(ctx)
    const signals = collectSummarySignals(messages)
    if (!shouldSummarize(state, signals)) return

    state.generating = true

    try {
      if (!summaryModelPromise) {
        summaryModelPromise = pickSummaryModel(ctx)
      }

      const summaryModel = await summaryModelPromise
      let nextName = ''

      if (summaryModel) {
        const response = await completeSimple(
          summaryModel.model,
          {
            systemPrompt: SUMMARY_PROMPT,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: buildSummaryInput(state, signals),
                  },
                ],
                timestamp: Date.now(),
              },
            ],
          },
          {
            apiKey: summaryModel.apiKey,
            headers: summaryModel.headers,
            maxTokens: 80,
          },
        )

        if (
          response.stopReason !== 'error' &&
          response.stopReason !== 'aborted'
        ) {
          const summary = response.content
            .filter(
              (content): content is { type: 'text'; text: string } =>
                content.type === 'text',
            )
            .map((content) => content.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[.!?]+$/, '')

          if (summary) nextName = preservePrefix(state.prefix, summary)
        }
      }

      if (!nextName) {
        nextName = buildFallbackSummaryName(state, signals)
      }

      const latestName = pi.getSessionName() ?? ''
      if (latestName && hasManualOverride(latestName, state.autoName)) {
        state.stage = 'external'
        state.autoName = latestName
        return
      }

      if (isMeaningfullyDifferent(latestName || state.autoName, nextName)) {
        applySessionName(pi, ctx, nextName)
        state.autoName = nextName
      }

      state.stage = 'final'
    } catch {
      // Keep the temporary name. A later turn can retry if summarization failed.
      summaryModelPromise = null
    } finally {
      state.generating = false
      persistState(pi, state)
    }
  })
}
