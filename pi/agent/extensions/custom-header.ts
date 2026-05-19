import path from 'node:path'
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

const MODEL_PLACEHOLDER = 'no model selected'

function projectName(cwd: string) {
  return path.basename(cwd) || 'session'
}

function center(text: string, width: number) {
  const padding = Math.max(0, Math.floor((width - visibleWidth(text)) / 2))
  return truncateToWidth(`${' '.repeat(padding)}${text}`, width)
}

function renderLogo(theme: Theme) {
  const body = (text: string) => theme.fg('success', text)
  const bulb = (text: string) => theme.fg('accent', text)
  const eye = (text: string) => theme.fg('warning', text)

  return [
    `   ${bulb('▄██▄')}`,
    ` ${bulb('▄██████▄')}`,
    ` ${body('██')} ${eye('●')}${body('██')}${eye('●')} ${body('██')}`,
    ` ${body('███▄▄▄▄███')}`,
    ` ${body('▀██  ██▀')}`,
  ]
}

function renderSubtitle(theme: Theme, modelId: string, cwd: string) {
  return [
    theme.fg('accent', modelId),
    theme.fg('dim', '·'),
    theme.fg('muted', projectName(cwd)),
  ].join(' ')
}

function renderHeader(
  theme: Theme,
  width: number,
  modelId: string,
  cwd: string,
) {
  return [
    '',
    ...renderLogo(theme).map((line) => center(line, width)),
    '',
    center(renderSubtitle(theme, modelId, cwd), width),
    '',
  ]
}

function installHeader(
  ctx: ExtensionContext,
  getModelId: () => string,
): (() => void) | undefined {
  if (!ctx.hasUI) return undefined

  let requestRender: (() => void) | undefined

  ctx.ui.setHeader((tui, theme) => {
    requestRender = () => tui.requestRender()

    return {
      render(width: number) {
        return renderHeader(theme, width, getModelId(), ctx.cwd)
      },
      invalidate() {
        tui.requestRender()
      },
    }
  })

  return () => requestRender?.()
}

export default function (pi: ExtensionAPI) {
  let modelId = MODEL_PLACEHOLDER
  let requestRender: (() => void) | undefined

  pi.on('session_start', (_event, ctx) => {
    modelId = ctx.model?.id ?? MODEL_PLACEHOLDER
    requestRender = installHeader(ctx, () => modelId)
  })

  pi.on('model_select', (event) => {
    modelId = event.model.id
    requestRender?.()
  })

  pi.on('session_shutdown', (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined)
    requestRender = undefined
  })

  pi.registerCommand('custom-header', {
    description: 'Enable the centered Pi logo header with model and project',
    handler: async (_args, ctx) => {
      modelId = ctx.model?.id ?? modelId
      requestRender = installHeader(ctx, () => modelId)
      ctx.ui.notify('Custom header enabled', 'info')
    },
  })

  pi.registerCommand('builtin-header', {
    description: "Restore Pi's built-in header",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined)
      requestRender = undefined
      ctx.ui.notify('Built-in header restored', 'info')
    },
  })
}
