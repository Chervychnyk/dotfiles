/**
 * Usage Bar Extension - Shows AI provider usage stats like CodexBar
 * Run /usage to see usage for Claude, Copilot, Gemini, and Codex
 *
 * Features:
 * - Usage stats with progress bars
 * - Provider status (outages/incidents)
 * - Reset countdowns
 */

import { getAgentDir, type ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { visibleWidth } from '@earendil-works/pi-tui'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// ============================================================================
// Types
// ============================================================================

interface RateWindow {
  label: string
  usedPercent: number
  resetDescription?: string
  resetsAt?: Date
}

interface ProviderStatus {
  indicator: 'none' | 'minor' | 'major' | 'critical' | 'maintenance' | 'unknown'
  description?: string
}

/**
 * The slice of pi's ModelRegistry this extension touches.
 *
 * pi ships no type declarations for it, so this is hand-derived and checked
 * against pi 0.84.3 (docs/extensions.md:997 plus the bundled runtime).
 *
 * `getProviderAuth` forwards to `runtime.getAuth(provider)`, which resolves
 * the stored credential: an OAuth credential goes through pi's refresh path
 * first, then the provider's own `toAuth` derivation. It returns
 * `{ auth, source }` — the derived auth, not the stored credential, so
 * credential fields like Codex's `accountId` are not reachable through it.
 *
 * Where the token lands depends on the credential type. API-key providers get
 * `auth.apiKey`; OAuth providers get an `Authorization: Bearer …` header and
 * leave `auth.apiKey` unset (`pi auth print-api-key --provider openai-codex`
 * rejects it as "configured with OAuth, not an API key"). `getAuthCredential`
 * in pi's own auth command reads both, in that order — mirrored below.
 *
 * Optional here because pi's docs are the only contract; a build without it
 * falls back to reading auth.json directly.
 */
interface PiProviderAuth {
  auth?: {
    apiKey?: string
    headers?: Record<string, string>
  }
  source?: string
}

interface PiModelRegistry {
  getProviderAuth?(provider: string): Promise<PiProviderAuth | undefined>
}

interface UsageSnapshot {
  provider: string
  displayName: string
  windows: RateWindow[]
  plan?: string
  error?: string
  status?: ProviderStatus
}

// ============================================================================
// Status Polling
// ============================================================================

const PI_AUTH_PATH = path.join(getAgentDir(), 'auth.json')
const HOME_DIR = process.env.HOME || os.homedir()
const GEMINI_OAUTH_CREDS_PATH = path.join(
  HOME_DIR,
  '.gemini',
  'oauth_creds.json',
)
const CODEX_HOME = process.env.CODEX_HOME || path.join(HOME_DIR, '.codex')

const STATUS_URLS: Record<string, string> = {
  anthropic: 'https://status.anthropic.com/api/v2/status.json',
  codex: 'https://status.openai.com/api/v2/status.json',
  copilot: 'https://www.githubstatus.com/api/v2/status.json',
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return clampPercent(value >= 0 && value <= 1 ? value * 100 : value)
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  ms = 5000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function fetchProviderStatus(provider: string): Promise<ProviderStatus> {
  const url = STATUS_URLS[provider]
  if (!url) return { indicator: 'none' }

  try {
    const res = await fetchWithTimeout(url, {}, 5000)
    if (!res.ok) return { indicator: 'unknown' }

    const data = (await res.json()) as any
    const indicator = data.status?.indicator || 'none'
    const description = data.status?.description

    return {
      indicator: indicator as ProviderStatus['indicator'],
      description,
    }
  } catch {
    return { indicator: 'unknown' }
  }
}

async function fetchGeminiStatus(): Promise<ProviderStatus> {
  try {
    const res = await fetchWithTimeout(
      'https://www.google.com/appsstatus/dashboard/incidents.json',
      {},
      5000,
    )
    if (!res.ok) return { indicator: 'unknown' }

    const incidents = (await res.json()) as any[]

    // Look for active Gemini incidents (product ID: npdyhgECDJ6tB66MxXyo)
    const geminiProductId = 'npdyhgECDJ6tB66MxXyo'
    const activeIncidents = incidents.filter((inc: any) => {
      if (inc.end) return false // Not active
      const affected =
        inc.currently_affected_products || inc.affected_products || []
      return affected.some((p: any) => p.id === geminiProductId)
    })

    if (activeIncidents.length === 0) {
      return { indicator: 'none' }
    }

    // Find most severe
    let worstIndicator: ProviderStatus['indicator'] = 'minor'
    let description: string | undefined

    for (const inc of activeIncidents) {
      const status = inc.most_recent_update?.status || inc.status_impact
      if (status === 'SERVICE_OUTAGE') {
        worstIndicator = 'critical'
        description = inc.external_desc
      } else if (
        status === 'SERVICE_DISRUPTION' &&
        worstIndicator !== 'critical'
      ) {
        worstIndicator = 'major'
        description = inc.external_desc
      }
    }

    return { indicator: worstIndicator, description }
  } catch {
    return { indicator: 'unknown' }
  }
}

// ============================================================================
// Claude Usage
// ============================================================================

async function runCommand(
  pi: ExtensionAPI,
  command: string,
  args: string[],
  timeout?: number,
) {
  const result = await pi.exec(command, args, { timeout }).catch(() => null)
  if (!result || result.killed) return null
  return result
}

async function loadClaudeToken(pi: ExtensionAPI): Promise<string | undefined> {
  // Try pi's auth.json first (has user:profile scope)
  try {
    if (fs.existsSync(PI_AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(PI_AUTH_PATH, 'utf-8'))
      if (data.anthropic?.access) return data.anthropic.access
    }
  } catch {}

  // Fallback to Claude CLI keychain (macOS only)
  if (process.platform !== 'darwin') return undefined

  const result = await runCommand(
    pi,
    'security',
    ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
    5000,
  )
  if (!result || result.code !== 0) return undefined

  try {
    const keychainData = result.stdout.trim()
    if (!keychainData) return undefined
    const parsed = JSON.parse(keychainData)
    const scopes = parsed.claudeAiOauth?.scopes || []
    if (scopes.includes('user:profile') && parsed.claudeAiOauth?.accessToken) {
      return parsed.claudeAiOauth.accessToken
    }
  } catch {}

  return undefined
}

async function fetchClaudeUsage(pi: ExtensionAPI): Promise<UsageSnapshot> {
  const token = await loadClaudeToken(pi)
  if (!token) {
    return {
      provider: 'anthropic',
      displayName: 'Claude',
      windows: [],
      error: 'No credentials',
    }
  }

  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    })

    if (!res.ok) {
      return {
        provider: 'anthropic',
        displayName: 'Claude',
        windows: [],
        error: `HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as any
    const windows: RateWindow[] = []

    if (data.five_hour?.utilization !== undefined) {
      windows.push({
        label: '5h',
        usedPercent: data.five_hour.utilization,
        resetDescription: data.five_hour.resets_at
          ? formatReset(new Date(data.five_hour.resets_at))
          : undefined,
      })
    }

    if (data.seven_day?.utilization !== undefined) {
      windows.push({
        label: 'Week',
        usedPercent: data.seven_day.utilization,
        resetDescription: data.seven_day.resets_at
          ? formatReset(new Date(data.seven_day.resets_at))
          : undefined,
      })
    }

    const modelWindow = data.seven_day_sonnet || data.seven_day_opus
    if (modelWindow?.utilization !== undefined) {
      windows.push({
        label: data.seven_day_sonnet ? 'Sonnet' : 'Opus',
        usedPercent: modelWindow.utilization,
      })
    }

    return { provider: 'anthropic', displayName: 'Claude', windows }
  } catch (e) {
    return {
      provider: 'anthropic',
      displayName: 'Claude',
      windows: [],
      error: String(e),
    }
  }
}

// ============================================================================
// Copilot Usage
// ============================================================================

function loadCopilotRefreshToken(): string | undefined {
  // The copilot_internal/user endpoint needs the GitHub OAuth token (ghu_*),
  // NOT the Copilot session token (tid=*). The refresh token IS the GitHub OAuth token.
  try {
    if (fs.existsSync(PI_AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(PI_AUTH_PATH, 'utf-8'))
      // Use refresh token (GitHub OAuth token ghu_*) for the usage API
      if (data['github-copilot']?.refresh) return data['github-copilot'].refresh
    }
  } catch {}

  return undefined
}

async function fetchCopilotUsage(
  _modelRegistry: PiModelRegistry | undefined,
): Promise<UsageSnapshot> {
  const token = loadCopilotRefreshToken()
  if (!token) {
    return {
      provider: 'copilot',
      displayName: 'Copilot',
      windows: [],
      error: 'No token',
    }
  }

  const headersBase = {
    'Editor-Version': 'vscode/1.96.2',
    'User-Agent': 'GitHubCopilotChat/0.26.7',
    'X-Github-Api-Version': '2025-04-01',
    Accept: 'application/json',
  }

  const tryFetch = async (authHeader: string) => {
    return fetchWithTimeout('https://api.github.com/copilot_internal/user', {
      headers: {
        ...headersBase,
        Authorization: authHeader,
      },
    })
  }

  try {
    // Copilot access tokens (from /login github-copilot) expect Bearer. PATs accept "token".
    // GitHub OAuth token (ghu_*) requires "token" prefix, not Bearer
    const attempts = [`token ${token}`]
    let lastStatus: number | undefined
    let res: Response | undefined

    for (const auth of attempts) {
      res = await tryFetch(auth)
      lastStatus = res.status
      if (res.ok) break
      if (res.status === 401 || res.status === 403) continue // try next scheme
      break
    }

    if (!res || !res.ok) {
      const status = lastStatus ?? 0
      return {
        provider: 'copilot',
        displayName: 'Copilot',
        windows: [],
        error: `HTTP ${status}`,
      }
    }

    const data = (await res.json()) as any
    const windows: RateWindow[] = []

    // Parse reset date for display
    const resetDate = data.quota_reset_date_utc
      ? new Date(data.quota_reset_date_utc)
      : undefined
    const resetDesc = resetDate ? formatReset(resetDate) : undefined

    // Premium interactions (e.g., Claude, o1 models) - has a cap
    if (data.quota_snapshots?.premium_interactions) {
      const pi = data.quota_snapshots.premium_interactions
      const remaining = pi.remaining ?? 0
      const entitlement = pi.entitlement ?? 0
      const usedPercent = Math.max(0, 100 - (pi.percent_remaining || 0))
      windows.push({
        label: `Premium`,
        usedPercent,
        resetDescription: resetDesc
          ? `${resetDesc} (${remaining}/${entitlement})`
          : `${remaining}/${entitlement}`,
      })
    }

    // Chat quota - often unlimited, only show if limited
    if (data.quota_snapshots?.chat && !data.quota_snapshots.chat.unlimited) {
      const chat = data.quota_snapshots.chat
      windows.push({
        label: 'Chat',
        usedPercent: Math.max(0, 100 - (chat.percent_remaining || 0)),
        resetDescription: resetDesc,
      })
    }

    return {
      provider: 'copilot',
      displayName: 'Copilot',
      windows,
      plan: data.copilot_plan,
    }
  } catch (e) {
    return {
      provider: 'copilot',
      displayName: 'Copilot',
      windows: [],
      error: String(e),
    }
  }
}

// ============================================================================
// Gemini Usage
// ============================================================================

async function fetchGeminiUsage(
  _modelRegistry: PiModelRegistry | undefined,
): Promise<UsageSnapshot> {
  let token: string | undefined

  // Read directly from pi's auth.json
  try {
    if (fs.existsSync(PI_AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(PI_AUTH_PATH, 'utf-8'))
      token = data['google-gemini-cli']?.access
    }
  } catch {}

  // Fallback to ~/.gemini/oauth_creds.json
  if (!token) {
    try {
      if (fs.existsSync(GEMINI_OAUTH_CREDS_PATH)) {
        const data = JSON.parse(
          fs.readFileSync(GEMINI_OAUTH_CREDS_PATH, 'utf-8'),
        )
        token = data.access_token
      }
    } catch {}
  }

  if (!token) {
    return {
      provider: 'gemini',
      displayName: 'Gemini',
      windows: [],
      error: 'No credentials',
    }
  }

  try {
    const res = await fetchWithTimeout(
      'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    )

    if (!res.ok) {
      return {
        provider: 'gemini',
        displayName: 'Gemini',
        windows: [],
        error: `HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as any
    const quotas: Record<string, number> = {}

    for (const bucket of data.buckets || []) {
      const model = bucket.modelId || 'unknown'
      const frac = bucket.remainingFraction ?? 1
      if (!quotas[model] || frac < quotas[model]) quotas[model] = frac
    }

    const windows: RateWindow[] = []
    let proMin = 1,
      flashMin = 1
    let hasProModel = false,
      hasFlashModel = false

    for (const [model, frac] of Object.entries(quotas)) {
      if (model.toLowerCase().includes('pro')) {
        hasProModel = true
        if (frac < proMin) proMin = frac
      }
      if (model.toLowerCase().includes('flash')) {
        hasFlashModel = true
        if (frac < flashMin) flashMin = frac
      }
    }

    // Always show windows if model exists (even at 0% usage)
    if (hasProModel)
      windows.push({ label: 'Pro', usedPercent: (1 - proMin) * 100 })
    if (hasFlashModel)
      windows.push({ label: 'Flash', usedPercent: (1 - flashMin) * 100 })

    return { provider: 'gemini', displayName: 'Gemini', windows }
  } catch (e) {
    return {
      provider: 'gemini',
      displayName: 'Gemini',
      windows: [],
      error: String(e),
    }
  }
}

// ============================================================================
// pi credential resolution
// ============================================================================

/**
 * Resolve a provider's live token through pi's documented auth API.
 *
 * For an OAuth credential this refreshes first when the token is inside pi's
 * validity window (5 min) and persists the new one, so the token is live.
 * Resolves to undefined when the provider is not registered or nothing is
 * stored, and throws a ModelsError when resolution or refresh fails — both
 * are swallowed here so every caller falls back to auth.json.
 *
 * Returns the derived auth only: `accountId`, `projectId` and friends live on
 * the stored credential and still come from auth.json.
 *
 * The extraction mirrors `getAuthCredential` in pi's auth command: API-key
 * providers expose `auth.apiKey`, OAuth providers expose only an
 * `Authorization: Bearer …` header.
 */
async function resolveRegistryToken(
  modelRegistry: PiModelRegistry | undefined,
  provider: string,
): Promise<string | undefined> {
  try {
    const resolved = await modelRegistry?.getProviderAuth?.(provider)

    const apiKey = resolved?.auth?.apiKey
    if (typeof apiKey === 'string' && apiKey.length > 0) return apiKey

    const authorization = Object.entries(resolved?.auth?.headers ?? {}).find(
      ([name]) => name.toLowerCase() === 'authorization',
    )?.[1]
    if (typeof authorization === 'string') {
      const bearer = /^Bearer\s+(.+)$/iu.exec(authorization)?.[1]
      if (bearer && bearer.length > 0) return bearer
    }
  } catch {}

  return undefined
}

// ============================================================================
// Antigravity Usage
// ============================================================================

type AntigravityAuth = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  projectId?: string
}

function loadAntigravityAuthFromPiAuthJson(): AntigravityAuth | undefined {
  try {
    if (!fs.existsSync(PI_AUTH_PATH)) return undefined
    const data = JSON.parse(fs.readFileSync(PI_AUTH_PATH, 'utf-8'))

    // Provider is called "google-antigravity" in pi.
    const cred =
      data['google-antigravity'] ?? data['antigravity'] ?? data['anti-gravity']
    if (!cred) return undefined

    const accessToken =
      typeof cred.access === 'string' ? cred.access : undefined
    if (!accessToken) return undefined

    return {
      accessToken,
      refreshToken: typeof cred.refresh === 'string' ? cred.refresh : undefined,
      expiresAt: typeof cred.expires === 'number' ? cred.expires : undefined,
      projectId:
        typeof cred.projectId === 'string'
          ? cred.projectId
          : typeof cred.project_id === 'string'
            ? cred.project_id
            : undefined,
    }
  } catch {
    return undefined
  }
}

async function loadAntigravityAuth(
  modelRegistry: PiModelRegistry | undefined,
): Promise<AntigravityAuth | undefined> {
  // Registry first: it runs pi's OAuth refresh path, and a refresh persists
  // the new credential to auth.json. Reading auth.json afterwards therefore
  // picks up the post-refresh `expires`, which matters because the caller
  // refreshes again on its own when expiresAt is within 5 minutes — the same
  // window pi uses, so a stale value here would cause a redundant refresh.
  const registryToken = await resolveRegistryToken(
    modelRegistry,
    'google-antigravity',
  )

  // projectId/refresh/expires are credential fields the registry does not
  // expose, so they come from auth.json either way.
  const fromPi = loadAntigravityAuthFromPiAuthJson()

  if (registryToken) {
    return {
      accessToken: registryToken,
      projectId: fromPi?.projectId,
      refreshToken: fromPi?.refreshToken,
      expiresAt: fromPi?.expiresAt,
    }
  }

  if (fromPi) return fromPi

  // Last resort: env var (won't have projectId; request will likely fail)
  if (process.env.ANTIGRAVITY_API_KEY) {
    return { accessToken: process.env.ANTIGRAVITY_API_KEY }
  }

  return undefined
}

async function refreshAntigravityAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt?: number } | null> {
  try {
    const clientId = process.env.ANTIGRAVITY_GOOGLE_CLIENT_ID
    const clientSecret = process.env.ANTIGRAVITY_GOOGLE_CLIENT_SECRET
    if (!clientId || !clientSecret) return null

    const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })

    if (!res.ok) return null
    const data = (await res.json()) as any
    const accessToken =
      typeof data.access_token === 'string' ? data.access_token : undefined
    if (!accessToken) return null
    const expiresIn =
      typeof data.expires_in === 'number' ? data.expires_in : undefined
    return {
      accessToken,
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
    }
  } catch {
    return null
  }
}

async function fetchAntigravityUsage(
  modelRegistry: PiModelRegistry | undefined,
): Promise<UsageSnapshot> {
  const auth = await loadAntigravityAuth(modelRegistry)
  if (!auth?.accessToken) {
    return {
      provider: 'antigravity',
      displayName: 'Antigravity',
      windows: [],
      error: 'No credentials',
    }
  }

  if (!auth.projectId) {
    return {
      provider: 'antigravity',
      displayName: 'Antigravity',
      windows: [],
      error: 'Missing projectId',
    }
  }

  let accessToken = auth.accessToken

  // Refresh if likely expired.
  if (
    auth.refreshToken &&
    auth.expiresAt &&
    auth.expiresAt < Date.now() + 5 * 60 * 1000
  ) {
    const refreshed = await refreshAntigravityAccessToken(auth.refreshToken)
    if (refreshed?.accessToken) accessToken = refreshed.accessToken
  }

  const fetchModels = async (token: string): Promise<Response> => {
    return fetchWithTimeout(
      'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'antigravity/1.12.4',
          'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
          Accept: 'application/json',
        },
        body: JSON.stringify({ project: auth.projectId }),
      },
    )
  }

  try {
    let res = await fetchModels(accessToken)

    if ((res.status === 401 || res.status === 403) && auth.refreshToken) {
      const refreshed = await refreshAntigravityAccessToken(auth.refreshToken)
      if (refreshed?.accessToken) {
        accessToken = refreshed.accessToken
        res = await fetchModels(accessToken)
      }
    }

    if (res.status === 401 || res.status === 403) {
      return {
        provider: 'antigravity',
        displayName: 'Antigravity',
        windows: [],
        error: 'Unauthorized',
      }
    }

    if (!res.ok) {
      return {
        provider: 'antigravity',
        displayName: 'Antigravity',
        windows: [],
        error: `HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as any
    const models: Record<string, any> = data.models || {}

    const getQuotaInfo = (
      modelKeys: string[],
    ): { usedPercent: number; resetDescription?: string } | null => {
      for (const key of modelKeys) {
        const qi = models?.[key]?.quotaInfo
        if (!qi) continue
        // In practice (CodexBar issue #129), some models only provide resetTime.
        // Treat missing remainingFraction as 0% remaining (100% used), which matches Antigravity's behavior when quota is exhausted.
        const remainingFraction =
          typeof qi.remainingFraction === 'number' ? qi.remainingFraction : 0
        const usedPercent = Math.min(
          100,
          Math.max(0, (1 - remainingFraction) * 100),
        )
        const resetTime = qi.resetTime ? new Date(qi.resetTime) : undefined
        return {
          usedPercent,
          resetDescription: resetTime ? formatReset(resetTime) : undefined,
        }
      }
      return null
    }

    // Quota groups from the reference snippet in CodexBar issue #129.
    const windows: RateWindow[] = []

    const claudeOrGptOss = getQuotaInfo([
      'claude-sonnet-4-5',
      'claude-sonnet-4-5-thinking',
      'claude-opus-4-5-thinking',
      'gpt-oss-120b-medium',
    ])
    if (claudeOrGptOss) {
      windows.push({
        label: 'Claude',
        usedPercent: claudeOrGptOss.usedPercent,
        resetDescription: claudeOrGptOss.resetDescription,
      })
    }

    const gemini3Pro = getQuotaInfo([
      'gemini-3-pro-high',
      'gemini-3-pro-low',
      'gemini-3-pro-preview',
    ])
    if (gemini3Pro) {
      windows.push({
        label: 'G3 Pro',
        usedPercent: gemini3Pro.usedPercent,
        resetDescription: gemini3Pro.resetDescription,
      })
    }

    const gemini3Flash = getQuotaInfo(['gemini-3-flash'])
    if (gemini3Flash) {
      windows.push({
        label: 'G3 Flash',
        usedPercent: gemini3Flash.usedPercent,
        resetDescription: gemini3Flash.resetDescription,
      })
    }

    if (windows.length === 0) {
      return {
        provider: 'antigravity',
        displayName: 'Antigravity',
        windows: [],
        error: 'No quota data',
      }
    }

    return { provider: 'antigravity', displayName: 'Antigravity', windows }
  } catch (e) {
    return {
      provider: 'antigravity',
      displayName: 'Antigravity',
      windows: [],
      error: String(e),
    }
  }
}

// ============================================================================
// Codex (OpenAI) Usage
// ============================================================================

async function fetchCodexUsage(
  modelRegistry: PiModelRegistry | undefined,
): Promise<UsageSnapshot> {
  let accountId: string | undefined

  // pi's registry resolves and refreshes the token, but not accountId.
  let accessToken = await resolveRegistryToken(modelRegistry, 'openai-codex')

  // pi's auth.json holds the persisted OAuth login and is the only source for
  // accountId, so read it even when the registry supplied the token.
  try {
    if (fs.existsSync(PI_AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(PI_AUTH_PATH, 'utf-8'))
      const cred = data['openai-codex'] ?? data['codex']
      if (!accessToken) {
        if (typeof cred?.access === 'string') accessToken = cred.access
        else if (typeof cred?.apiKey === 'string') accessToken = cred.apiKey
      }
      if (typeof cred?.accountId === 'string') accountId = cred.accountId
    }
  } catch {}

  // Last resort: the Codex CLI's own credentials at ~/.codex/auth.json
  if (!accessToken) {
    const authPath = path.join(CODEX_HOME, 'auth.json')

    try {
      if (fs.existsSync(authPath)) {
        const data = JSON.parse(fs.readFileSync(authPath, 'utf-8'))

        if (data.OPENAI_API_KEY) {
          accessToken = data.OPENAI_API_KEY
        } else if (data.tokens?.access_token) {
          accessToken = data.tokens.access_token
          accountId = data.tokens.account_id
        }
      }
    } catch {}
  }

  if (!accessToken) {
    return {
      provider: 'codex',
      displayName: 'Codex',
      windows: [],
      error: 'No credentials',
    }
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'CodexBar',
      Accept: 'application/json',
    }

    if (accountId) {
      headers['ChatGPT-Account-Id'] = accountId
    }

    const res = await fetchWithTimeout('https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET',
      headers,
    })

    if (res.status === 401 || res.status === 403) {
      return {
        provider: 'codex',
        displayName: 'Codex',
        windows: [],
        error: 'Token expired',
      }
    }

    if (!res.ok) {
      return {
        provider: 'codex',
        displayName: 'Codex',
        windows: [],
        error: `HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as any
    const windows = collectCodexWindows(data.rate_limit)

    // Credits info
    let plan = data.plan_type
    if (data.credits?.balance !== undefined && data.credits.balance !== null) {
      const balance =
        typeof data.credits.balance === 'number'
          ? data.credits.balance
          : parseFloat(data.credits.balance) || 0
      // Only worth showing when there is actually a balance to report.
      if (balance > 0 || data.credits.unlimited) {
        plan = plan
          ? `${plan} ($${balance.toFixed(2)})`
          : `$${balance.toFixed(2)}`
      }
    }

    return { provider: 'codex', displayName: 'Codex', windows, plan }
  } catch (e) {
    return {
      provider: 'codex',
      displayName: 'Codex',
      windows: [],
      error: String(e),
    }
  }
}

// ============================================================================
// Kiro (AWS)
// ============================================================================

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;?]*[A-Za-z]|\x1B\].*?\x07/g, '')
}

async function fetchKiroUsage(pi: ExtensionAPI): Promise<UsageSnapshot> {
  const version = await runCommand(pi, 'kiro-cli', ['--version'], 5000)
  if (!version || version.code !== 0) {
    return {
      provider: 'kiro',
      displayName: 'Kiro',
      windows: [],
      error: 'kiro-cli not found',
    }
  }

  try {
    const whoami = await runCommand(pi, 'kiro-cli', ['whoami'], 5000)
    if (!whoami || whoami.code !== 0) {
      return {
        provider: 'kiro',
        displayName: 'Kiro',
        windows: [],
        error: 'Not logged in',
      }
    }

    const usage = await runCommand(
      pi,
      'kiro-cli',
      ['chat', '--no-interactive', '/usage'],
      10000,
    )
    if (!usage || usage.code !== 0) {
      throw new Error(
        usage?.stderr?.trim() ||
          usage?.stdout?.trim() ||
          'kiro-cli usage failed',
      )
    }

    const stripped = stripAnsi(usage.stdout)
    const windows: RateWindow[] = []

    // Parse plan name from "| KIRO FREE" or similar
    let planName = 'Kiro'
    const planMatch = stripped.match(/\|\s*(KIRO\s+\w+)/i)
    if (planMatch) {
      planName = planMatch[1].trim()
    }

    // Parse credits percentage from "████...█ X%"
    let creditsPercent = 0
    const percentMatch = stripped.match(/█+\s*(\d+)%/)
    if (percentMatch) {
      creditsPercent = parseInt(percentMatch[1], 10)
    }

    // Parse credits used/total from "(X.XX of Y covered in plan)"
    let creditsUsed = 0
    let creditsTotal = 50
    const creditsMatch = stripped.match(/\((\d+\.?\d*)\s+of\s+(\d+)\s+covered/)
    if (creditsMatch) {
      creditsUsed = parseFloat(creditsMatch[1])
      creditsTotal = parseFloat(creditsMatch[2])
      if (!percentMatch && creditsTotal > 0) {
        creditsPercent = (creditsUsed / creditsTotal) * 100
      }
    }

    // Parse reset date from "resets on 01/01"
    let resetsAt: Date | undefined
    const resetMatch = stripped.match(/resets on (\d{2}\/\d{2})/)
    if (resetMatch) {
      const [month, day] = resetMatch[1].split('/').map(Number)
      const now = new Date()
      const year = now.getFullYear()
      resetsAt = new Date(year, month - 1, day)
      if (resetsAt < now) resetsAt.setFullYear(year + 1)
    }

    windows.push({
      label: 'Credits',
      usedPercent: creditsPercent,
      resetDescription: resetsAt ? formatReset(resetsAt) : undefined,
    })

    // Parse bonus credits
    const bonusMatch = stripped.match(/Bonus credits:\s*(\d+\.?\d*)\/(\d+)/)
    if (bonusMatch) {
      const bonusUsed = parseFloat(bonusMatch[1])
      const bonusTotal = parseFloat(bonusMatch[2])
      const bonusPercent = bonusTotal > 0 ? (bonusUsed / bonusTotal) * 100 : 0
      const expiryMatch = stripped.match(/expires in (\d+) days?/)
      windows.push({
        label: 'Bonus',
        usedPercent: bonusPercent,
        resetDescription: expiryMatch ? `${expiryMatch[1]}d left` : undefined,
      })
    }

    return { provider: 'kiro', displayName: 'Kiro', windows, plan: planName }
  } catch (e) {
    return {
      provider: 'kiro',
      displayName: 'Kiro',
      windows: [],
      error: String(e),
    }
  }
}

// ============================================================================
// MiniMax / Kimi
// ============================================================================

async function loadProviderToken(
  modelRegistry: PiModelRegistry | undefined,
  provider: string,
  authJsonKey: string,
  envKey: string,
): Promise<string | undefined> {
  const registryToken = await resolveRegistryToken(modelRegistry, provider)
  if (registryToken) return registryToken

  try {
    if (fs.existsSync(PI_AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(PI_AUTH_PATH, 'utf-8'))
      const cred = data[authJsonKey] ?? data[provider]
      const token = cred?.access ?? cred?.apiKey ?? cred?.api_key
      if (typeof token === 'string' && token.length > 0) return token
    }
  } catch {}

  const envToken = process.env[envKey]
  return envToken && envToken.length > 0 ? envToken : undefined
}

/**
 * Reads every rate-limit window the Codex payload exposes. `secondary_window`
 * and `additional_rate_limits` are often null (a Plus plan reports only the
 * weekly window in `primary_window`), so each source is optional.
 */
function collectCodexWindows(rateLimit: any): RateWindow[] {
  const toWindow = (
    raw: any,
    defaultSeconds?: number,
  ): RateWindow | undefined => {
    if (!raw || typeof raw !== 'object') return undefined
    const seconds =
      typeof raw.limit_window_seconds === 'number'
        ? raw.limit_window_seconds
        : defaultSeconds
    if (!seconds) return undefined

    const resetDate =
      typeof raw.reset_at === 'number'
        ? new Date(raw.reset_at * 1000)
        : undefined
    return {
      label: formatWindowLabel(seconds),
      usedPercent: raw.used_percent || 0,
      resetDescription: resetDate ? formatReset(resetDate) : undefined,
    }
  }

  const windows = [
    toWindow(rateLimit?.primary_window, 10800),
    toWindow(rateLimit?.secondary_window, 86400),
  ]

  const additional = rateLimit?.additional_rate_limits
  const extras = Array.isArray(additional)
    ? additional
    : additional && typeof additional === 'object'
      ? Object.values(additional)
      : []
  for (const extra of extras) windows.push(toWindow(extra))

  return windows.filter((window): window is RateWindow => window !== undefined)
}

function formatWindowLabel(limitWindowSeconds: number): string {
  const hours = Math.round(limitWindowSeconds / 3600)
  const days = Math.round(limitWindowSeconds / 86400)
  if (days === 7) return 'Week'
  if (days === 1) return 'Day'
  if (hours >= 24) return `${days}d`
  return `${hours}h`
}

function formatDurationLabel(startMs?: number, endMs?: number): string {
  if (!startMs || !endMs || endMs <= startMs) return 'Limit'
  const hours = Math.round((endMs - startMs) / 3600000)
  if (hours >= 24) return hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`
  return `${Math.max(1, hours)}h`
}

async function fetchMiniMaxUsage(
  modelRegistry: PiModelRegistry | undefined,
  provider: 'minimax' | 'minimax-cn',
): Promise<UsageSnapshot> {
  const token = await loadProviderToken(
    modelRegistry,
    provider,
    provider,
    provider === 'minimax' ? 'MINIMAX_API_KEY' : 'MINIMAX_CN_API_KEY',
  )
  const displayName = provider === 'minimax' ? 'MiniMax' : 'MiniMax CN'
  if (!token) return { provider, displayName, windows: [], error: 'No credentials' }

  const url =
    provider === 'minimax'
      ? 'https://api.minimax.io/v1/token_plan/remains'
      : 'https://api.minimaxi.com/v1/token_plan/remains'

  try {
    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) return { provider, displayName, windows: [], error: `HTTP ${res.status}` }

    const data = (await res.json()) as any
    if (data.base_resp?.status_code !== 0) {
      return {
        provider,
        displayName,
        windows: [],
        error: data.base_resp?.status_msg || 'API error',
      }
    }

    const buckets = data.model_remains || []
    const bucket =
      buckets.find((b: any) => b.model_name === 'general' && b.current_interval_status === 1) ||
      buckets.find((b: any) => b.model_name === 'general') ||
      buckets.find((b: any) => b.current_interval_status === 1) ||
      buckets[0]
    if (!bucket) return { provider, displayName, windows: [], error: 'No quota data' }

    const windows: RateWindow[] = []
    if (bucket.current_interval_remaining_percent !== undefined) {
      const end = bucket.end_time ? new Date(bucket.end_time) : undefined
      windows.push({
        label: formatDurationLabel(bucket.start_time, bucket.end_time),
        usedPercent: normalizePercent(100 - bucket.current_interval_remaining_percent),
        resetDescription: end ? formatReset(end) : undefined,
      })
    }
    if (bucket.current_weekly_remaining_percent !== undefined) {
      const end = bucket.weekly_end_time ? new Date(bucket.weekly_end_time) : undefined
      windows.push({
        label: 'Week',
        usedPercent: normalizePercent(100 - bucket.current_weekly_remaining_percent),
        resetDescription: end ? formatReset(end) : undefined,
      })
    }

    return { provider, displayName, windows }
  } catch (e) {
    return { provider, displayName, windows: [], error: String(e) }
  }
}

async function fetchKimiUsage(
  modelRegistry: PiModelRegistry | undefined,
): Promise<UsageSnapshot> {
  const provider = 'kimi-coding'
  const displayName = 'Kimi'
  const token = await loadProviderToken(modelRegistry, provider, provider, 'KIMI_API_KEY')
  if (!token) return { provider, displayName, windows: [], error: 'No credentials' }

  try {
    const res = await fetchWithTimeout('https://api.kimi.com/coding/v1/usages', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) return { provider, displayName, windows: [], error: `HTTP ${res.status}` }

    const data = (await res.json()) as any
    const windows: RateWindow[] = []
    for (const limit of data.limits || []) {
      const detail = limit.detail || {}
      const total = Number(detail.limit || 0)
      const remaining = Number(detail.remaining || 0)
      if (total <= 0) continue
      const duration = limit.window?.timeUnit === 'TIME_UNIT_MINUTE' ? limit.window?.duration : undefined
      const reset = detail.resetTime ? new Date(detail.resetTime) : undefined
      windows.push({
        label: duration ? `${duration}m` : 'Limit',
        usedPercent: normalizePercent(((total - remaining) / total) * 100),
        resetDescription: reset ? formatReset(reset) : undefined,
      })
    }

    const weekly = data.usage || {}
    const weeklyTotal = Number(weekly.limit || 0)
    const weeklyRemaining = Number(weekly.remaining || 0)
    if (weeklyTotal > 0) {
      const reset = weekly.resetTime ? new Date(weekly.resetTime) : undefined
      windows.push({
        label: 'Week',
        usedPercent: normalizePercent(((weeklyTotal - weeklyRemaining) / weeklyTotal) * 100),
        resetDescription: reset ? formatReset(reset) : undefined,
      })
    }

    return { provider, displayName, windows }
  } catch (e) {
    return { provider, displayName, windows: [], error: String(e) }
  }
}

// ============================================================================
// z.ai
// ============================================================================

async function fetchZaiUsage(
  modelRegistry: PiModelRegistry | undefined,
): Promise<UsageSnapshot> {
  const apiKey = await loadProviderToken(
    modelRegistry,
    'zai',
    'z-ai',
    'Z_AI_API_KEY',
  )

  if (!apiKey) {
    return {
      provider: 'zai',
      displayName: 'z.ai',
      windows: [],
      error: 'No API key',
    }
  }

  try {
    const res = await fetchWithTimeout('https://api.z.ai/api/monitor/usage/quota/limit', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      return {
        provider: 'zai',
        displayName: 'z.ai',
        windows: [],
        error: `HTTP ${res.status}`,
      }
    }

    const data = (await res.json()) as any
    if (!data.success || data.code !== 200) {
      return {
        provider: 'zai',
        displayName: 'z.ai',
        windows: [],
        error: data.msg || 'API error',
      }
    }

    const windows: RateWindow[] = []
    const limits = data.data?.limits || []

    for (const limit of limits) {
      const type = limit.type
      const usage = limit.usage || 0
      const remaining = limit.remaining || 0
      const percent = limit.percentage || 0
      const nextReset = limit.nextResetTime
        ? new Date(limit.nextResetTime)
        : undefined

      // Unit: 1=days, 3=hours, 5=minutes
      let windowLabel = 'Limit'
      if (limit.unit === 1) windowLabel = `${limit.number}d`
      else if (limit.unit === 3) windowLabel = `${limit.number}h`
      else if (limit.unit === 5) windowLabel = `${limit.number}m`

      if (type === 'TOKENS_LIMIT') {
        windows.push({
          label: `Tokens (${windowLabel})`,
          usedPercent: percent,
          resetDescription: nextReset ? formatReset(nextReset) : undefined,
        })
      } else if (type === 'TIME_LIMIT') {
        windows.push({
          label: 'Monthly',
          usedPercent: percent,
          resetDescription: nextReset ? formatReset(nextReset) : undefined,
        })
      }
    }

    const planName = data.data?.planName || data.data?.plan || undefined
    return { provider: 'zai', displayName: 'z.ai', windows, plan: planName }
  } catch (e) {
    return {
      provider: 'zai',
      displayName: 'z.ai',
      windows: [],
      error: String(e),
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

type UsageFetchContext = {
  modelRegistry: PiModelRegistry | undefined
  pi: ExtensionAPI
}

const USAGE_SOURCES: Array<{
  provider: string
  displayName: string
  fetch: (ctx: UsageFetchContext) => Promise<UsageSnapshot>
}> = [
  { provider: 'anthropic', displayName: 'Claude', fetch: ({ pi }) => fetchClaudeUsage(pi) },
  { provider: 'copilot', displayName: 'Copilot', fetch: ({ modelRegistry }) => fetchCopilotUsage(modelRegistry) },
  { provider: 'gemini', displayName: 'Gemini', fetch: ({ modelRegistry }) => fetchGeminiUsage(modelRegistry) },
  { provider: 'codex', displayName: 'Codex', fetch: ({ modelRegistry }) => fetchCodexUsage(modelRegistry) },
  { provider: 'antigravity', displayName: 'Antigravity', fetch: ({ modelRegistry }) => fetchAntigravityUsage(modelRegistry) },
  { provider: 'kiro', displayName: 'Kiro', fetch: ({ pi }) => fetchKiroUsage(pi) },
  { provider: 'minimax', displayName: 'MiniMax', fetch: ({ modelRegistry }) => fetchMiniMaxUsage(modelRegistry, 'minimax') },
  { provider: 'minimax-cn', displayName: 'MiniMax CN', fetch: ({ modelRegistry }) => fetchMiniMaxUsage(modelRegistry, 'minimax-cn') },
  { provider: 'kimi-coding', displayName: 'Kimi', fetch: ({ modelRegistry }) => fetchKimiUsage(modelRegistry) },
  { provider: 'zai', displayName: 'z.ai', fetch: ({ modelRegistry }) => fetchZaiUsage(modelRegistry) },
]

/** Providers with a public status page. Keyed by the USAGE_SOURCES provider id. */
const STATUS_SOURCES: Array<{ provider: string; fetch: () => Promise<ProviderStatus> }> = [
  { provider: 'anthropic', fetch: () => fetchProviderStatus('anthropic') },
  { provider: 'copilot', fetch: () => fetchProviderStatus('copilot') },
  { provider: 'gemini', fetch: () => fetchGeminiStatus() },
  { provider: 'codex', fetch: () => fetchProviderStatus('codex') },
]

/** Errors that mean "provider not set up", so the row is hidden rather than shown as failing. */
const UNCONFIGURED_ERRORS = new Set([
  'No credentials',
  'No token',
  'kiro-cli not found',
  'No API key',
])

function normalizeUsageSnapshot(snapshot: UsageSnapshot): UsageSnapshot {
  return {
    ...snapshot,
    windows: snapshot.windows.map((window) => ({
      ...window,
      usedPercent: normalizePercent(window.usedPercent),
    })),
  }
}

function formatReset(date: Date): string {
  const diffMs = date.getTime() - Date.now()
  if (diffMs < 0) return 'now'

  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m`

  const hours = Math.floor(diffMins / 60)
  const mins = diffMins % 60
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ${hours % 24}h`

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function getStatusEmoji(status?: ProviderStatus): string {
  if (!status) return ''
  switch (status.indicator) {
    case 'none':
      return '✅'
    case 'minor':
      return '⚠️'
    case 'major':
      return '🟠'
    case 'critical':
      return '🔴'
    case 'maintenance':
      return '🔧'
    default:
      return ''
  }
}

// ============================================================================
// UI Component
// ============================================================================

class UsageComponent {
  private usages: UsageSnapshot[] = []
  private loading = true
  private tui: { requestRender: () => void }
  private theme: any
  private onClose: () => void
  private modelRegistry: PiModelRegistry | undefined
  private pi: ExtensionAPI

  constructor(
    tui: { requestRender: () => void },
    theme: any,
    onClose: () => void,
    modelRegistry: PiModelRegistry | undefined,
    pi: ExtensionAPI,
  ) {
    this.tui = tui
    this.theme = theme
    this.onClose = onClose
    this.modelRegistry = modelRegistry
    this.pi = pi
    this.load()
  }

  private async load() {
    const context: UsageFetchContext = { modelRegistry: this.modelRegistry, pi: this.pi }

    // Fetch usage and status in parallel
    const [snapshots, statuses] = await Promise.all([
      Promise.all(
        USAGE_SOURCES.map((source) =>
          withTimeout(source.fetch(context), 6000, {
            provider: source.provider,
            displayName: source.displayName,
            windows: [],
            error: 'Timeout',
          }),
        ),
      ),
      Promise.all(
        STATUS_SOURCES.map((source) =>
          withTimeout(source.fetch(), 3000, { indicator: 'unknown' as const }),
        ),
      ),
    ])

    const statusByProvider = new Map(
      STATUS_SOURCES.map((source, index) => [source.provider, statuses[index]]),
    )
    snapshots.forEach((snapshot, index) => {
      const status = statusByProvider.get(USAGE_SOURCES[index]!.provider)
      if (status) snapshot.status = status
    })

    // Hide providers with no data and no error (not configured)
    this.usages = snapshots.map(normalizeUsageSnapshot).filter(
      (u) => u.windows.length > 0 || !UNCONFIGURED_ERRORS.has(u.error ?? ''),
    )
    this.loading = false
    this.tui.requestRender()
  }

  handleInput(_data: string): void {
    this.onClose()
  }

  invalidate(): void {}

  render(width: number): string[] {
    const t = this.theme
    const dim = (s: string) => t.fg('muted', s)
    const bold = (s: string) => t.bold(s)
    const accent = (s: string) => t.fg('accent', s)

    // Box dimensions: total width includes borders
    const totalW = Math.min(55, width - 4)
    const innerW = totalW - 4 // subtract "│ " and " │"
    const hLine = '─'.repeat(totalW - 2) // subtract corners

    const box = (content: string) => {
      const contentW = visibleWidth(content)
      const pad = Math.max(0, innerW - contentW)
      return dim('│ ') + content + ' '.repeat(pad) + dim(' │')
    }

    const lines: string[] = []
    lines.push(dim(`╭${hLine}╮`))
    lines.push(box(bold(accent('AI Usage'))))
    lines.push(dim(`├${hLine}┤`))

    if (this.loading) {
      lines.push(box('Loading...'))
    } else {
      for (const u of this.usages) {
        // Provider header with status emoji and plan
        const statusEmoji = getStatusEmoji(u.status)
        const planStr = u.plan ? dim(` (${u.plan})`) : ''
        const statusStr = statusEmoji ? ` ${statusEmoji}` : ''
        lines.push(box(bold(u.displayName) + planStr + statusStr))

        // Show incident description if any
        if (
          u.status?.indicator &&
          u.status.indicator !== 'none' &&
          u.status.indicator !== 'unknown' &&
          u.status.description
        ) {
          const desc =
            u.status.description.length > 40
              ? u.status.description.substring(0, 37) + '...'
              : u.status.description
          lines.push(box(t.fg('warning', `  ⚡ ${desc}`)))
        }

        if (u.error) {
          lines.push(box(dim(`  ${u.error}`)))
        } else if (u.windows.length === 0) {
          lines.push(box(dim('  No data')))
        } else {
          for (const w of u.windows) {
            const usedPercent = normalizePercent(w.usedPercent)
            const remaining = clampPercent(100 - usedPercent)
            const barW = 12
            const filled = Math.min(
              barW,
              Math.round((usedPercent / 100) * barW),
            )
            const empty = barW - filled
            const color =
              remaining <= 10
                ? 'error'
                : remaining <= 30
                  ? 'warning'
                  : 'success'
            const bar = t.fg(color, '█'.repeat(filled)) + dim('░'.repeat(empty))
            const reset = w.resetDescription
              ? dim(` ⏱ ${w.resetDescription}`)
              : ''
            lines.push(
              box(
                `  ${w.label.padEnd(7)} ${bar} ${remaining.toFixed(0).padStart(3)}%${reset}`,
              ),
            )
          }
        }
        lines.push(box(''))
      }
    }

    lines.push(dim(`├${hLine}┤`))
    lines.push(box(dim('Press any key to close')))
    lines.push(dim(`╰${hLine}╯`))

    return lines
  }

  dispose(): void {}
}

// ============================================================================
// Hook
// ============================================================================

export default function (pi: ExtensionAPI) {
  pi.registerCommand('usage', {
    description: 'Show AI provider usage statistics',
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify('Usage requires interactive mode', 'error')
        return
      }

      const modelRegistry = ctx.modelRegistry
      await ctx.ui.custom((tui, theme, _kb, done) => {
        return new UsageComponent(tui, theme, () => done(), modelRegistry, pi)
      })
    },
  })
}
