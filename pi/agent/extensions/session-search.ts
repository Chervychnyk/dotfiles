import type { ExtensionAPI } from '@mariozechner/pi-coding-agent'
import { getAgentDir } from '@mariozechner/pi-tui'
import fs from 'node:fs/promises'
import path from 'node:path'

interface SessionMatch {
  path: string
  cwd: string
  started: string
  score: number
  preview: string
  scoreBreakdown: {
    text: number
    cwd: number
    project: number
    recency: number
  }
}

const MAX_TEXT_CHARS = 12000

function scoreTerm(haystack: string, term: string, base: number): number {
  const idx = haystack.indexOf(term)
  if (idx >= 0) return base + Math.max(0, 1000 - idx) / 1000

  const parts = term.split(/[-_/.:\s]+/).filter(Boolean)
  if (parts.length > 1 && parts.every((part) => haystack.includes(part))) {
    return base * 0.65
  }

  return 0
}

function scoreText(haystack: string, terms: string[]): number {
  const lower = haystack.toLowerCase()
  return terms.reduce((sum, term) => sum + scoreTerm(lower, term, 10), 0)
}

function scoreProjectAffinity(sessionCwd: string, currentCwd: string): number {
  const session = sessionCwd.toLowerCase()
  const current = currentCwd.toLowerCase()
  if (!session || !current) return 0
  if (session === current) return 40
  if (session.startsWith(current) || current.startsWith(session)) return 24

  const sessionBase = path.basename(session)
  const currentBase = path.basename(current)
  if (sessionBase && sessionBase === currentBase) return 12
  if (sessionBase && currentBase && (sessionBase.includes(currentBase) || currentBase.includes(sessionBase))) {
    return 6
  }

  return 0
}

function scoreRecency(started: string): number {
  if (!started) return 0
  const ts = Date.parse(started)
  if (Number.isNaN(ts)) return 0
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24)
  if (ageDays <= 1) return 8
  if (ageDays <= 7) return 5
  if (ageDays <= 30) return 2
  return 0
}

async function collectSessionFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        out.push(full)
      }
    }
  }
  try {
    await walk(root)
  } catch {
    return []
  }
  out.sort((a, b) => b.localeCompare(a))
  return out
}

async function inspectSession(filePath: string, query: string, currentCwd: string): Promise<SessionMatch | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const lines = raw.split('\n').filter(Boolean)
    let cwd = ''
    let started = ''
    const chunks: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const obj = JSON.parse(lines[i])
      if (i === 0 && obj.type === 'session') {
        cwd = obj.cwd || ''
        started = obj.timestamp || ''
        continue
      }
      if (obj.type !== 'message') continue
      const message = obj.message || {}
      if (!['user', 'assistant'].includes(message.role)) continue
      const content = message.content
      if (typeof content === 'string') {
        chunks.push(content)
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && block.type === 'text' && typeof block.text === 'string') {
            chunks.push(block.text)
          }
        }
      }
      if (chunks.join('\n').length > MAX_TEXT_CHARS) break
    }

    const text = chunks.join('\n')
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const textScore = scoreText(text, terms)
    const cwdScore = scoreText(`${cwd}\n${path.basename(filePath)}`, terms) * 1.4
    const projectScore = scoreProjectAffinity(cwd, currentCwd)
    const recencyScore = scoreRecency(started)
    const score = textScore + cwdScore + projectScore + recencyScore
    if (score <= 0 || (textScore <= 0 && cwdScore <= 0)) return null

    const previewSource = text.replace(/\s+/g, ' ')
    const previewIdx = previewSource.toLowerCase().indexOf(terms[0] || '')
    const start = Math.max(0, previewIdx - 40)
    const preview = previewSource.slice(start, start + 160)

    return {
      path: filePath,
      cwd,
      started,
      score,
      preview,
      scoreBreakdown: {
        text: textScore,
        cwd: cwdScore,
        project: projectScore,
        recency: recencyScore,
      },
    }
  } catch {
    return null
  }
}

export default function sessionSearchExtension(pi: ExtensionAPI) {
  pi.registerCommand('session-search', {
    description: 'Search prior Pi sessions by text',
    handler: async (args, ctx) => {
      const query = args.trim() || (await ctx.ui.input('Search sessions for:', 'e.g. handoff web tools'))?.trim()
      if (!query) return

      const root = path.join(getAgentDir(), 'sessions')
      const files = await collectSessionFiles(root)
      if (files.length === 0) {
        ctx.ui.notify('No session files found', 'info')
        return
      }

      const matches = (await Promise.all(files.slice(0, 300).map((file) => inspectSession(file, query, ctx.cwd))))
        .filter((m): m is SessionMatch => !!m)
        .sort((a, b) => b.score - a.score || b.started.localeCompare(a.started))
        .slice(0, 12)

      if (matches.length === 0) {
        ctx.ui.notify(`No session matches for "${query}"`, 'info')
        return
      }

      const selected = await ctx.ui.select(
        `Session matches for "${query}"`,
        matches.map((m) => {
          const scoreBits = [
            `Σ${m.score.toFixed(1)}`,
            `txt:${m.scoreBreakdown.text.toFixed(1)}`,
            `cwd:${m.scoreBreakdown.cwd.toFixed(1)}`,
            `proj:${m.scoreBreakdown.project.toFixed(1)}`,
            `recent:${m.scoreBreakdown.recency.toFixed(1)}`,
          ].join(' ')
          return `${path.basename(m.path)} — ${scoreBits} — ${m.cwd || '?'} — ${m.preview || 'no preview'}`
        }),
      )
      if (!selected) return

      const match = matches.find((m) => selected.startsWith(path.basename(m.path)))
      if (!match) return

      pi.sendMessage({
        customType: 'session-search',
        display: true,
        content: `Found session:\n- path: ${match.path}\n- cwd: ${match.cwd || '?'}\n- started: ${match.started || '?'}\n\nNext step:\n\`uv run pi/agent/skills/session-reader/scripts/read_session.py ${match.path} --mode toc\``,
      })
    },
  })
}
