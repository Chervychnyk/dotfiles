import fs from 'node:fs/promises'
import path from 'node:path'
import {
  getMarkdownTheme,
  keyHint,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type Theme,
} from '@earendil-works/pi-coding-agent'
import {
  Markdown,
  TUI,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui'

const MAX_MARKDOWN_BYTES = 1024 * 1024

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

async function resolveProjectFile(cwd: string, input: string): Promise<string> {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('Usage: /mdview <path>')

  const root = await fs.realpath(cwd)
  const candidate = path.resolve(root, trimmed)
  const real = await fs.realpath(candidate)
  if (!isWithin(root, real)) {
    throw new Error('Markdown preview can only open files inside this project')
  }

  const stat = await fs.stat(real)
  if (!stat.isFile()) throw new Error('Markdown preview path must be a file')
  if (stat.size > MAX_MARKDOWN_BYTES) {
    throw new Error(
      `Markdown file is too large (${stat.size} bytes; max ${MAX_MARKDOWN_BYTES})`,
    )
  }

  return real
}

class MarkdownPreviewOverlay {
  private markdown: Markdown
  private scrollOffset = 0
  private viewHeight = 0
  private totalLines = 0

  constructor(
    private tui: TUI,
    private theme: Theme,
    private keybindings: { matches: (keyData: string, action: string) => boolean },
    private title: string,
    text: string,
    private done: () => void,
  ) {
    this.markdown = new Markdown(text, 1, 0, getMarkdownTheme())
  }

  handleInput(keyData: string): void {
    if (this.keybindings.matches(keyData, 'tui.select.cancel')) {
      this.done()
      return
    }
    if (this.keybindings.matches(keyData, 'tui.select.up')) {
      this.scrollBy(-1)
      return
    }
    if (this.keybindings.matches(keyData, 'tui.select.down')) {
      this.scrollBy(1)
      return
    }
    if (this.keybindings.matches(keyData, 'tui.select.pageUp')) {
      this.scrollBy(-this.viewHeight || -1)
      return
    }
    if (this.keybindings.matches(keyData, 'tui.select.pageDown')) {
      this.scrollBy(this.viewHeight || 1)
      return
    }
  }

  render(width: number): string[] {
    const maxHeight = Math.max(10, Math.floor((this.tui.terminal.rows || 24) * 0.85))
    const innerWidth = Math.max(10, width - 2)
    const contentHeight = Math.max(1, maxHeight - 5)
    const rendered = this.markdown.render(innerWidth)

    this.totalLines = rendered.length
    this.viewHeight = contentHeight
    const maxScroll = Math.max(0, this.totalLines - contentHeight)
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll))

    const visible = rendered.slice(this.scrollOffset, this.scrollOffset + contentHeight)
    const title = this.centerTitle(innerWidth)
    const footer = this.theme.fg(
      'dim',
      `${keyHint('tui.select.up', 'up')} ${keyHint('tui.select.down', 'down')}  ${keyHint('tui.select.pageUp', 'page up')} ${keyHint('tui.select.pageDown', 'page down')}  ${keyHint('tui.select.cancel', 'close')}`,
    )
    const body = [title, '', ...visible, ...Array(Math.max(0, contentHeight - visible.length)).fill(''), footer]
    const border = (text: string) => this.theme.fg('borderMuted', text)

    return [
      border(`┌${'─'.repeat(innerWidth)}┐`),
      ...body.map((line) => {
        const truncated = truncateToWidth(line, innerWidth)
        return `${border('│')}${truncated}${' '.repeat(Math.max(0, innerWidth - visibleWidth(truncated)))}${border('│')}`
      }),
      border(`└${'─'.repeat(innerWidth)}┘`),
    ].map((line) => truncateToWidth(line, width))
  }

  invalidate(): void {}

  private scrollBy(delta: number): void {
    const maxScroll = Math.max(0, this.totalLines - this.viewHeight)
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + delta, maxScroll))
    this.tui.requestRender()
  }

  private centerTitle(width: number): string {
    const label = ` ${this.title} `
    const labelWidth = visibleWidth(label)
    if (labelWidth >= width) return truncateToWidth(this.theme.fg('accent', label.trim()), width)
    const left = Math.floor((width - labelWidth) / 2)
    return `${this.theme.fg('borderMuted', '─'.repeat(left))}${this.theme.fg('accent', label)}${this.theme.fg('borderMuted', '─'.repeat(width - labelWidth - left))}`
  }
}

export default function markdownPreviewExtension(pi: ExtensionAPI) {
  pi.registerCommand('mdview', {
    description: 'Preview a project Markdown file. Usage: /mdview <path>',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== 'tui') {
        ctx.ui.notify('/mdview is only available in the TUI', 'warning')
        return
      }

      try {
        const filePath = await resolveProjectFile(ctx.cwd, args || '')
        const text = await fs.readFile(filePath, 'utf8')
        const title = path.relative(ctx.cwd, filePath) || path.basename(filePath)
        await ctx.ui.custom<void>(
          (overlayTui, overlayTheme, overlayKb, overlayDone) =>
            new MarkdownPreviewOverlay(overlayTui, overlayTheme, overlayKb, title, text, overlayDone),
          {
            overlay: true,
            overlayOptions: {
              width: '85%',
              maxHeight: '85%',
              anchor: 'center',
            },
          },
        )
      } catch (error: any) {
        ctx.ui.notify(error?.message || 'Unable to preview Markdown file', 'error')
      }
    },
  })
}
