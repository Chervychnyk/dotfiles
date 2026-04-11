/**
 * Auto Session Name Extension
 *
 * Sets an immediate temporary name from the first user message, then
 * upgrades it to an LLM-generated summary after the first bit of session
 * context is available.
 */
import { completeSimple, type Api, type Model } from '@mariozechner/pi-ai'
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'

const skillPattern = /^\/skill:(\S+)\s*([\s\S]*)/

const SUMMARY_PROMPT = `You are naming a coding session.
Generate a short, specific session title based on the user's first request and the current session context.
Rules:
- 5 to 10 words preferred
- describe the actual task or outcome, not generic phrasing
- no quotes
- no markdown
- no trailing punctuation
- use sentence case`

const MIN_ASSISTANT_CHARS = 500
const MIN_USER_TURNS = 3

function cleanSessionName(text: string): string {
  let cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/(?:\/[\w.-]+){2,}/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length < 5) {
    cleaned = text.replace(/\s+/g, ' ').trim()
  }

  if (cleaned.length > 60) {
    const sentenceEnd = cleaned.slice(0, 65).search(/[.!?]\s/)
    if (sentenceEnd > 15 && sentenceEnd <= 60) {
      cleaned = cleaned.slice(0, sentenceEnd + 1)
    } else {
      const truncated = cleaned.slice(0, 60)
      const lastSpace = truncated.lastIndexOf(' ')
      cleaned = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated
    }
  }

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  return cleaned
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (b): b is { type: string; text?: string } =>
        !!b && typeof b === 'object' && 'type' in b,
    )
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text ?? '')
    .join(' ')
    .trim()
}

function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function isMeaningfullyDifferent(current: string, next: string): boolean {
  const a = normalizeForComparison(current)
  const b = normalizeForComparison(next)
  if (!a || !b) return false
  if (a === b) return false
  if (a.includes(b) || b.includes(a)) return false
  return true
}

function preservePrefix(prefix: string, title: string): string {
  return `${prefix}${cleanSessionName(title)}`.trim()
}

async function pickSummaryModel(ctx: {
  model: Model<Api> | undefined
  modelRegistry: {
    find: (provider: string, modelId: string) => Model<Api> | undefined
    getApiKeyAndHeaders: (model: Model<Api>) => Promise<
      | { ok: true; apiKey?: string; headers?: Record<string, string> }
      | { ok: false; error: string }
    >
  }
}): Promise<{ model: Model<Api>; apiKey?: string; headers?: Record<string, string> } | null> {
  const preferred = [
    ctx.modelRegistry.find('openai-codex', 'gpt-5-mini'),
    ctx.modelRegistry.find('anthropic', 'claude-haiku-4-5'),
    ctx.model,
  ].filter(Boolean) as Model<Api>[]

  for (const model of preferred) {
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model)
    if (auth.ok) {
      return { model, apiKey: auth.apiKey, headers: auth.headers }
    }
  }

  return null
}

export default function (pi: ExtensionAPI) {
  let tempNamed = false
  let llmNamed = false
  let firstUserText = ''
  let firstPromptBody = ''
  let skillPrefix = ''
  let generating = false
  let autoName = ''

  pi.on('session_start', async (_event, _ctx) => {
    const existing = pi.getSessionName()
    tempNamed = !!existing
    llmNamed = !!existing
    firstUserText = ''
    firstPromptBody = ''
    skillPrefix = ''
    generating = false
    autoName = ''
  })

  pi.on('input', async (event) => {
    if (tempNamed) return
    const text = event.text.trim()
    if (!text) return

    firstUserText = text
    const skillMatch = text.match(skillPattern)
    if (skillMatch) {
      skillPrefix = `[${skillMatch[1]}] `
      firstPromptBody = skillMatch[2].trim()
    } else {
      skillPrefix = ''
      firstPromptBody = text
    }

    const name = cleanSessionName(firstPromptBody || text)
    if (!name) return

    autoName = preservePrefix(skillPrefix, name)
    pi.setSessionName(autoName)
    tempNamed = true
  })

  pi.on('agent_end', async (event, ctx) => {
    if (llmNamed || generating || !firstUserText) return

    const currentName = pi.getSessionName() ?? ''
    if (currentName && autoName && currentName !== autoName) {
      llmNamed = true
      return
    }

    const userTurns = event.messages.filter((m) => m.role === 'user').length
    const assistantMessages = event.messages.filter((m) => m.role === 'assistant')
    const assistantTexts = assistantMessages
      .map((m) => extractText(m.content))
      .filter(Boolean)
    const assistantText = assistantTexts.join('\n\n')
    const assistantChars = assistantText.length
    const hasToolUse = assistantMessages.some(
      (m) => Array.isArray(m.content) && m.content.some((b: any) => b?.type === 'toolCall'),
    )

    const shouldSummarize =
      skillPrefix.length > 0
        ? assistantChars > 0
        : assistantChars >= MIN_ASSISTANT_CHARS ||
          userTurns >= MIN_USER_TURNS ||
          (hasToolUse && assistantChars > 180)

    if (!shouldSummarize) return

    const summaryModel = await pickSummaryModel(ctx)
    if (!summaryModel) return

    generating = true
    try {
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
                  text: `First user message:\n${firstPromptBody || firstUserText}\n\nCurrent session context:\n${assistantText.slice(0, 1800)}\n\nUser turns: ${userTurns}\nTool use observed: ${hasToolUse ? 'yes' : 'no'}`,
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

      if (response.stopReason === 'error' || response.stopReason === 'aborted') return

      const summary = response.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.!?]+$/, '')

      if (!summary) return

      const nextName = preservePrefix(skillPrefix, summary)
      if (!isMeaningfullyDifferent(currentName || autoName, nextName)) {
        llmNamed = true
        return
      }

      const latestName = pi.getSessionName() ?? ''
      if (latestName && autoName && latestName !== autoName) {
        llmNamed = true
        return
      }

      pi.setSessionName(nextName)
      autoName = nextName
      llmNamed = true
    } catch {
      // Keep the temporary name.
    } finally {
      generating = false
    }
  })
}
