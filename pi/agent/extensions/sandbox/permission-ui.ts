import { Key, matchesKey, truncateToWidth } from '@earendil-works/pi-tui'
import {
  PERMISSION_CHOICES,
  parsePermissionChoice,
  type PermissionChoice,
} from './policy.ts'

export type SandboxUiLevel = 'info' | 'warning' | 'error'
export type SandboxTheme = {
  fg: (color: string, text: string) => string
  bg: (color: string, text: string) => string
}
export type SandboxCustomTui = { requestRender: () => void }
export type SandboxCustomComponent = {
  render: (width: number) => string[]
  handleInput?: (data: string) => void
  invalidate: () => void
}
export type SandboxCtx = {
  cwd?: string
  ui: {
    theme: SandboxTheme
    notify: (message: string, level: SandboxUiLevel) => void
    setStatus: (key: string, value: string | undefined) => void
    custom?: <T>(
      factory: (
        tui: SandboxCustomTui,
        theme: SandboxTheme,
        keybindings: unknown,
        done: (result: T) => void,
      ) => SandboxCustomComponent,
      options?: unknown,
    ) => Promise<T>
    input?: (title: string, placeholder?: string) => Promise<string | undefined>
    select?: (title: string, options: string[]) => Promise<string | undefined>
  }
}

async function inlineChoice(ctx: SandboxCtx, title: string) {
  const choices = PERMISSION_CHOICES

  if (!ctx.ui.custom) return undefined

  return ctx.ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    let selected = 0
    const renderLine = () =>
      choices
        .map((choice, index) => {
          const text = `[${choice.key}] ${choice.label}`
          return index === selected
            ? theme.bg('selectedBg', theme.fg('accent', text))
            : theme.fg('muted', text)
        })
        .join('  ')

    return {
      render(width: number) {
        return [
          truncateToWidth(theme.fg('warning', title), width),
          truncateToWidth(renderLine(), width),
          truncateToWidth(theme.fg('dim', '←/→ choose • enter select • esc abort'), width),
        ]
      },
      handleInput(data: string) {
        if (matchesKey(data, Key.left) && selected > 0) {
          selected -= 1
          tui.requestRender()
          return
        }
        if (matchesKey(data, Key.right) && selected < choices.length - 1) {
          selected += 1
          tui.requestRender()
          return
        }
        if (matchesKey(data, Key.enter)) {
          done(choices[selected]?.key)
          return
        }
        if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
          done('a')
          return
        }
        const direct = choices.find((choice) => data.toLowerCase() === choice.key)
        if (direct) done(direct.key)
      },
      invalidate() {},
    }
  })
}

export async function askPermission(
  ctx: SandboxCtx,
  prompt: string,
): Promise<PermissionChoice> {
  if (!ctx.ui.custom && !ctx.ui.input && !ctx.ui.select) return 'abort'

  const answer =
    (await inlineChoice(ctx, prompt)) ??
    (ctx.ui.input
      ? await ctx.ui.input(`${prompt}\n[a] abort  [s] session  [p] project  [g] global`, 'a/s/p/g')
      : await ctx.ui.select!(prompt, [
          '[a] abort',
          '[s] session',
          '[p] project',
          '[g] global',
        ]))

  return parsePermissionChoice(answer)
}
