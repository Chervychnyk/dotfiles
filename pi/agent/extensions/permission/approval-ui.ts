import type { ExtensionContext } from '@mariozechner/pi-coding-agent'
import { Key, matchesKey, truncateToWidth } from '@mariozechner/pi-tui'

const PREVIEW_VIEWPORT_MAX_RATIO = 0.8
const PREVIEW_VIEWPORT_MIN_ROWS = 6
const PREVIEW_RESERVED_UI_ROWS = 8

const APPROVAL_SCROLL_HINT =
  '↑↓ scroll • PgUp/PgDn page • ←→ choose • Enter confirm • Esc cancel'

export type ScrollableApprovalContent = string | ((width: number) => string)

type ScrollableApprovalInputResult = {
  scrollOffset: number
  actionIndex: number
  submit?: true
  cancel?: true
}

function getTuiViewportRows(tui: { terminal?: { rows?: number }; height?: number }): number {
  const terminalRows = typeof tui.terminal?.rows === 'number' ? tui.terminal.rows : 0
  const viewportRows = typeof tui.height === 'number' ? tui.height : 0
  const measuredRows = Math.max(terminalRows, viewportRows)
  return measuredRows > 0 ? Math.max(12, measuredRows) : 24
}

function getPreviewViewportHeight(totalLines: number, viewportRows: number): number {
  const terminalHeight = Math.max(12, viewportRows)
  const maxByRatio = Math.floor(terminalHeight * PREVIEW_VIEWPORT_MAX_RATIO)
  const maxByScreen = Math.max(PREVIEW_VIEWPORT_MIN_ROWS, terminalHeight - PREVIEW_RESERVED_UI_ROWS)
  const cap = Math.max(PREVIEW_VIEWPORT_MIN_ROWS, Math.min(maxByRatio, maxByScreen))
  return Math.max(PREVIEW_VIEWPORT_MIN_ROWS, Math.min(Math.ceil(totalLines), cap))
}

function getApprovalContentLines(
  content: ScrollableApprovalContent,
  width: number,
): string[] {
  const renderedContent = typeof content === 'function' ? content(width) : content
  return renderedContent.split('\n')
}

function getMaxScrollOffset(totalLines: number, viewportHeight: number): number {
  return Math.max(0, totalLines - viewportHeight)
}

function getApprovalViewportMetrics(
  tui: { terminal?: { rows?: number }; height?: number },
  totalLines: number,
): { viewportHeight: number; maxScrollOffset: number } {
  const viewportHeight = getPreviewViewportHeight(totalLines, getTuiViewportRows(tui))
  return {
    viewportHeight,
    maxScrollOffset: getMaxScrollOffset(totalLines, viewportHeight),
  }
}

function getWrappedActionIndex(
  actionIndex: number,
  choicesLength: number,
  delta: number,
): number {
  if (choicesLength <= 0) return 0
  return (actionIndex + delta + choicesLength) % choicesLength
}

function processScrollableApprovalInput(
  data: string,
  scrollOffset: number,
  actionIndex: number,
  viewportHeight: number,
  maxScrollOffset: number,
  choicesLength: number,
): ScrollableApprovalInputResult {
  if (matchesKey(data, Key.up)) {
    return { scrollOffset: Math.max(0, scrollOffset - 1), actionIndex }
  }
  if (matchesKey(data, Key.down)) {
    return { scrollOffset: Math.min(maxScrollOffset, scrollOffset + 1), actionIndex }
  }
  if (matchesKey(data, Key.pageUp)) {
    return { scrollOffset: Math.max(0, scrollOffset - viewportHeight), actionIndex }
  }
  if (matchesKey(data, Key.pageDown)) {
    return { scrollOffset: Math.min(maxScrollOffset, scrollOffset + viewportHeight), actionIndex }
  }
  if (matchesKey(data, Key.left)) {
    return {
      scrollOffset,
      actionIndex: getWrappedActionIndex(actionIndex, choicesLength, -1),
    }
  }
  if (matchesKey(data, Key.right) || data === '\t') {
    return {
      scrollOffset,
      actionIndex: getWrappedActionIndex(actionIndex, choicesLength, 1),
    }
  }
  if (matchesKey(data, Key.enter)) {
    return { scrollOffset, actionIndex, submit: true }
  }
  if (matchesKey(data, Key.escape)) {
    return { scrollOffset, actionIndex, cancel: true }
  }

  return { scrollOffset, actionIndex }
}

function pushTruncatedApprovalRow(rows: string[], text: string, width: number) {
  rows.push(truncateToWidth(text, width))
}

function wrapPlainText(text: string, width: number): string[] {
  const maxWidth = Math.max(1, width)
  const out: string[] = []

  for (const rawLine of text.split('\n')) {
    if (!rawLine) {
      out.push('')
      continue
    }

    let remaining = rawLine
    while (remaining.length > maxWidth) {
      let splitAt = remaining.lastIndexOf(' ', maxWidth)
      if (splitAt <= 0) splitAt = maxWidth
      out.push(remaining.slice(0, splitAt).trimEnd())
      remaining = remaining.slice(splitAt).trimStart()
    }
    out.push(remaining)
  }

  return out
}

function renderActionBar(
  choices: string[],
  actionIndex: number,
  theme: any,
  width: number,
): string {
  const labels = choices.map((choice, index) => {
    const short = choice
      .replace('Always allow ', 'Allow ')
      .replace(' for session', '')
      .replace('this exact command', 'command')
      .replace('this directory', 'directory')
      .replace('this path', 'path')
      .replace('all bash', 'all bash')
    return index === actionIndex ? theme.fg('accent', `[${short}]`) : short
  })

  return truncateToWidth(labels.join('  '), width)
}

function buildScrollableApprovalHeaderRows(
  toolName: 'bash' | 'edit' | 'write',
  subject: string,
  totalLines: number,
  scrollOffset: number,
  viewportHeight: number,
  width: number,
  theme: any,
): string[] {
  const innerWidth = Math.max(1, width)
  const subjectLines = wrapPlainText(subject, innerWidth).slice(0, 2)
  const scrollLabel = `Lines ${scrollOffset + 1}-${Math.min(totalLines, scrollOffset + viewportHeight)} / ${totalLines}`
  const separator = theme.fg('accent', '─'.repeat(Math.max(8, width)))
  const rows: string[] = []

  pushTruncatedApprovalRow(
    rows,
    theme.fg('accent', theme.bold(`${toolName.toUpperCase()} approval`)),
    innerWidth,
  )
  for (const line of subjectLines) {
    pushTruncatedApprovalRow(rows, theme.fg('muted', line), innerWidth)
  }
  pushTruncatedApprovalRow(rows, theme.fg('dim', scrollLabel), innerWidth)
  pushTruncatedApprovalRow(rows, separator, innerWidth)

  return rows
}

function buildScrollableApprovalFooterRows(
  choices: string[],
  actionIndex: number,
  width: number,
  theme: any,
): string[] {
  const innerWidth = Math.max(1, width)
  const separator = theme.fg('accent', '─'.repeat(Math.max(8, width)))

  return [
    truncateToWidth(separator, innerWidth),
    truncateToWidth(theme.fg('dim', APPROVAL_SCROLL_HINT), innerWidth),
    truncateToWidth(renderActionBar(choices, actionIndex, theme, innerWidth), innerWidth),
  ]
}

function buildScrollableApprovalRows(
  toolName: 'bash' | 'edit' | 'write',
  subject: string,
  lines: string[],
  scrollOffset: number,
  viewportHeight: number,
  width: number,
  choices: string[],
  actionIndex: number,
  theme: any,
): string[] {
  const innerWidth = Math.max(1, width)
  const visible = lines.slice(scrollOffset, scrollOffset + viewportHeight)

  const rendered = buildScrollableApprovalHeaderRows(
    toolName,
    subject,
    lines.length,
    scrollOffset,
    viewportHeight,
    width,
    theme,
  )

  for (const line of visible) {
    pushTruncatedApprovalRow(rendered, line, innerWidth)
  }
  for (let i = visible.length; i < viewportHeight; i++) {
    pushTruncatedApprovalRow(rendered, '', innerWidth)
  }

  rendered.push(...buildScrollableApprovalFooterRows(choices, actionIndex, width, theme))
  return rendered
}

export async function showScrollableApproval(
  ctx: ExtensionContext,
  toolName: 'bash' | 'edit' | 'write',
  content: ScrollableApprovalContent,
  choices: string[],
  subject: string,
): Promise<string | null> {
  return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    let scrollOffset = 0
    let actionIndex = 0
    let lines: string[] = ['']

    return {
      render(width: number): string[] {
        const safeWidth = Math.max(20, width)
        lines = getApprovalContentLines(content, safeWidth)

        const { viewportHeight, maxScrollOffset } = getApprovalViewportMetrics(
          tui,
          lines.length,
        )
        scrollOffset = Math.min(scrollOffset, maxScrollOffset)

        return buildScrollableApprovalRows(
          toolName,
          subject,
          lines,
          scrollOffset,
          viewportHeight,
          safeWidth,
          choices,
          actionIndex,
          theme,
        )
      },
      invalidate() {},
      handleInput(data: string) {
        const { viewportHeight, maxScrollOffset } = getApprovalViewportMetrics(
          tui,
          lines.length,
        )

        const result = processScrollableApprovalInput(
          data,
          scrollOffset,
          actionIndex,
          viewportHeight,
          maxScrollOffset,
          choices.length,
        )
        scrollOffset = result.scrollOffset
        actionIndex = result.actionIndex

        if (result.submit) {
          done(choices[actionIndex] ?? null)
          return
        }
        if (result.cancel) {
          done(null)
          return
        }

        tui.requestRender()
      },
    }
  })
}
