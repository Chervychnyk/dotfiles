export const SIDE_BY_SIDE_MIN_WIDTH = 140
export const PREVIEW_MAX_LINES = 5000
export const DIFF_MAX_BYTES = 2 * 1024 * 1024
export const DIFF_MAX_LINES = 20000
export const DEFAULT_DIFF_RENDERER = process.env.PI_PERMISSION_DIFF_RENDERER ?? 'delta'
export const DEFAULT_SHIKI_THEME = process.env.PI_PERMISSION_SHIKI_THEME ?? 'github-dark'
export const DEFAULT_PREVIEW_WIDTH = resolveDefaultPreviewWidth()

export type DiffPreviewLayout = 'inline' | 'side-by-side'
export type PreviewRenderer = 'shiki' | 'delta' | 'bat' | 'fallback' | 'none'

export interface DiffPreviewOptions {
  diffRenderer?: string
  shikiTheme?: string
}

export interface DiffPreviewSource {
  targetPath: string
  oldText: string
  newText: string
}

export interface MutationPreview {
  renderer: PreviewRenderer
  content: string
  warnings: string[]
  diffSource?: DiffPreviewSource
}

export interface ResolvedPreviewContent {
  content: string
  layout: DiffPreviewLayout
}

function resolveDefaultPreviewWidth(): number {
  const configured = Number(process.env.PI_PERMISSION_PREVIEW_WIDTH)
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured)

  const stdoutColumns = process.stdout.columns
  if (Number.isFinite(stdoutColumns) && stdoutColumns > 0) return Math.floor(stdoutColumns)

  const columns = Number(process.env.COLUMNS)
  if (Number.isFinite(columns) && columns > 0) return Math.floor(columns)

  return 140
}
