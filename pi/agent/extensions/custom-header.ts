import path from 'node:path'
import {
  VERSION,
  keyHint,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

const MODEL_PLACEHOLDER = 'no model selected'
const PROVIDER_PLACEHOLDER = 'unknown provider'

function projectName(cwd: string) {
  return path.basename(cwd) || 'session'
}

function center(text: string, width: number) {
  const padding = Math.max(0, Math.floor((width - visibleWidth(text)) / 2))
  return truncateToWidth(`${' '.repeat(padding)}${text}`, width)
}

// Braille-art Bender eyes from Futurama. Rows are verbatim from the original
// 56-row piece (rows 30-42), cropped to the eyes so the silhouette fits a
// pinned header. 60 columns wide; pi measures braille as one cell per codepoint
// (verified against pi-tui `visibleWidth`), so `center()` aligns it.
const LOGO_ART = [
  '⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀',
  '⠀⠀⠀⠀⢀⣴⣾⣿⠿⠟⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠛⠻⠿⣿⣷⣦⡀⠀⠀⠀⠀',
  '⠀⠀⢀⣾⣿⠟⠉⠀⠀⠀⣠⣶⣶⣦⣤⣄⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣠⣤⣴⣶⣶⣄⠀⠀⠀⠈⠻⣿⣷⡀⠀⠀',
  '⠀⣰⣿⡟⠁⠀⠀⠀⢀⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣶⣤⣤⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣤⣤⣶⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⡀⠀⠀⠀⠈⢻⣿⣆⠀',
  '⢰⣿⡏⠀⠀⠀⠀⠀⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣶⡆⠀⠀⢰⣶⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⠀⠀⠀⠀⠀⢹⣿⡆',
  '⣾⣿⠀⠀⠀⠀⠀⢰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀⠀⣿⣷',
  '⣿⣿⠀⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏⠉⠉⠉⠉⣿⣿⣿⣿⣿⣿⣿⠀⠀⣿⣿⣿⣿⣿⣿⣿⠉⠉⠉⠉⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⠀⣿⣿',
  '⢻⣿⡀⠀⠀⠀⠀⠸⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⠀⠀⢿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⠇⠀⠀⠀⠀⢀⣿⡿',
  '⠘⣿⣧⠀⠀⠀⠀⠀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣧⣤⣤⣤⣤⣿⣿⣿⣿⣿⣿⠃⠀⠀⠘⣿⣿⣿⣿⣿⣿⣤⣤⣤⣤⣼⣿⣿⣿⣿⣿⣿⣿⣿⡟⠀⠀⠀⠀⠀⣼⣿⠃',
  '⠀⠘⢿⣷⡀⠀⠀⠀⠀⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠃⠀⠀⠀⠀⠘⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠀⠀⠀⠀⢀⣾⡿⠃⠀',
  '⠀⠀⠈⠻⣿⣶⣄⡀⠀⠀⠈⠻⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠋⠀⠀⠀⠀⠀⠀⠀⠀⠙⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠿⠟⠁⠀⠀⢀⣠⣶⣿⠟⠁⠀⠀',
  '⠀⠀⠀⠀⠀⠙⠻⢿⣿⣶⣶⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣤⣶⣶⣿⡿⠟⠋⠁⠀⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀',
]

function renderLogo(theme: Theme) {
  // Solid blue, as requested. `borderAccent` maps to blue in both local themes
  // (everforest-dark-hard -> #7fbbb3, kanagawa -> #7AA2C8), so the art follows
  // /settings theme changes instead of hardcoding an RGB value.
  const blue = theme.colors.borderAccent

  return LOGO_ART.map((line) => theme.style(line, { fg: blue }))
}

function renderSubtitle(
  theme: Theme,
  providerId: string,
  modelId: string,
  cwd: string,
  thinkingLevel: string,
) {
  return [
    theme.fg('muted', `Pi ${VERSION}`),
    theme.fg('dim', '·'),
    theme.fg('accent', `${providerId}/${modelId}`),
    theme.fg('dim', `(${thinkingLevel})`),
    theme.fg('dim', '·'),
    theme.fg('muted', projectName(cwd)),
  ].join(' ')
}

// An action disabled in keybindings.json renders as a bare label with no key,
// which reads as a broken gap in the hint row. Detect that and drop the hint.
function hasKey(hint: string): boolean {
  const plain = hint.replace(/\u001b\[[0-9;]*m/g, '').trim()
  return plain.split(/\s+/).length > 1
}

function renderKeyHints(theme: Theme) {
  const hints = [
    keyHint('app.interrupt', 'interrupt'),
    keyHint('app.thinking.cycle', 'thinking'),
    keyHint('app.model.cycleForward', 'model'),
    keyHint('app.tools.expand', 'tools'),
    keyHint('app.editor.external', 'editor'),
  ].filter(hasKey)

  return theme.fg('dim', hints.join('  '))
}

function renderHeader(
  theme: Theme,
  width: number,
  providerId: string,
  modelId: string,
  cwd: string,
  thinkingLevel: string,
) {
  return [
    '',
    ...renderLogo(theme).map((line) => center(line, width)),
    '',
    center(renderSubtitle(theme, providerId, modelId, cwd, thinkingLevel), width),
    center(renderKeyHints(theme), width),
    '',
  ]
}

function installHeader(
  ctx: ExtensionContext,
  getProviderId: () => string,
  getModelId: () => string,
  getThinkingLevel: () => string,
): (() => void) | undefined {
  if (!ctx.hasUI) return undefined

  let requestRender: (() => void) | undefined

  ctx.ui.setHeader((tui, theme) => {
    requestRender = () => tui.requestRender()

    return {
      render(width: number) {
        return renderHeader(
          theme,
          width,
          getProviderId(),
          getModelId(),
          ctx.cwd,
          getThinkingLevel(),
        )
      },
      invalidate() {
        tui.requestRender()
      },
    }
  })

  return () => requestRender?.()
}

export default function (pi: ExtensionAPI) {
  let providerId = PROVIDER_PLACEHOLDER
  let modelId = MODEL_PLACEHOLDER
  let requestRender: (() => void) | undefined

  pi.on('session_start', (_event, ctx) => {
    providerId = ctx.model?.provider ?? PROVIDER_PLACEHOLDER
    modelId = ctx.model?.id ?? MODEL_PLACEHOLDER
    requestRender = installHeader(
      ctx,
      () => providerId,
      () => modelId,
      () => pi.getThinkingLevel() || 'default',
    )
  })

  pi.on('model_select', (event) => {
    providerId = event.model.provider ?? PROVIDER_PLACEHOLDER
    modelId = event.model.id
    requestRender?.()
  })

  pi.on('thinking_level_select', () => {
    requestRender?.()
  })

  pi.on('session_shutdown', (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setHeader(undefined)
    requestRender = undefined
  })

  pi.registerCommand('custom-header', {
    description: 'Enable the centered Pi logo header with model and project',
    handler: async (_args, ctx) => {
      providerId = ctx.model?.provider ?? providerId
      modelId = ctx.model?.id ?? modelId
      requestRender = installHeader(
        ctx,
        () => providerId,
        () => modelId,
        () => pi.getThinkingLevel() || 'default',
      )
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
