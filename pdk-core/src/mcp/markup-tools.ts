// PDK prototypes each run their own Vite dev server on their own port, so the
// bridge discovers live Markup endpoints instead of assuming one port:
//   1. MARKUP_PORT env var, when set, wins (single fixed endpoint).
//   2. Otherwise every prototypes/*/pdk.json "defaultPort" is probed for
//      /markup/health and all live servers are aggregated.
// Sessions from every live server are merged; the most recently created one
// is the active session (single-user, single-tab model).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

function repoRoot(): string {
  // src/mcp/ (tsx) or dist/mcp/ (built) → repo root is three levels up.
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'stack-templates'))) return dir
    dir = resolvePath(dir, '..')
  }
  return process.cwd()
}

function candidatePorts(): number[] {
  if (process.env.MARKUP_PORT) return [Number(process.env.MARKUP_PORT)]
  const ports = new Set<number>()
  const prototypesDir = join(repoRoot(), 'prototypes')
  if (existsSync(prototypesDir)) {
    for (const entry of readdirSync(prototypesDir)) {
      const pdkPath = join(prototypesDir, entry, 'pdk.json')
      if (!existsSync(pdkPath)) continue
      try {
        const port = Number(JSON.parse(readFileSync(pdkPath, 'utf8')).defaultPort)
        if (Number.isInteger(port)) ports.add(port)
      } catch {
        // Unparseable pdk.json — skip; surfaced by the catalogue instead.
      }
    }
  }
  return [...ports]
}

async function liveBases(): Promise<string[]> {
  const bases = candidatePorts().map((p) => `http://localhost:${p}/markup`)
  const checks = await Promise.all(
    bases.map(async (base) => {
      const res = await safeFetch(`${base}/health`)
      return res?.ok ? base : null
    }),
  )
  return checks.filter((b): b is string => b !== null)
}

type AnnotationStatus = 'pending' | 'resolved' | 'dismissed'

type Annotation = {
  id: string
  status: AnnotationStatus
  comment?: string
  selector?: string
  elementPath?: string
  vueComponent?: string
  position?: unknown
  nearbyText?: string
  [key: string]: unknown
}

type PendingAction = {
  output: string
  annotations: Annotation[]
  timestamp: number
}

type SessionSummary = {
  id: string
  url: string
  createdAt?: number
  annotations: Annotation[]
  lastAction: PendingAction | null
  /** Which live server this session came from (added during discovery). */
  base: string
}

/**
 * Wraps globalThis.fetch so that network errors always resolve to null,
 * never propagate as rejected promises.
 */
async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const settled = await new Promise<{ ok: true; value: Response } | { ok: false }>(
    (resolve) => {
      try {
        const p = globalThis.fetch(url, init)
        p.then(
          (res) => resolve({ ok: true, value: res }),
          () => resolve({ ok: false }),
        )
      } catch {
        resolve({ ok: false })
      }
    },
  )
  return settled.ok ? settled.value : null
}

// Note: sessions are returned in insertion order. All three tools use the last
// created session, which is the correct session for the single-user, single-tab
// use case this tool is designed for. If multiple browser tabs are open to different
// prototypes simultaneously, the tools will target whichever prototype created its
// session most recently — a known limitation.
async function fetchSessions(): Promise<SessionSummary[] | null> {
  const bases = await liveBases()
  if (bases.length === 0) return null
  const all: SessionSummary[] = []
  for (const base of bases) {
    const res = await safeFetch(`${base}/sessions`)
    if (!res || !res.ok) continue
    try {
      const sessions = (await res.json()) as Omit<SessionSummary, 'base'>[]
      for (const s of sessions) all.push({ ...s, base })
    } catch {
      // Malformed response from one server shouldn't hide the others.
    }
  }
  all.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  return all
}

export async function getStatus(): Promise<{
  running: boolean
  sessionId: string | null
  pendingCount: number
  hasPendingAction: boolean
}> {
  const sessions = await fetchSessions()
  if (!sessions) return { running: false, sessionId: null, pendingCount: 0, hasPendingAction: false }
  const active = sessions[sessions.length - 1] ?? null
  const pendingCount = active?.lastAction?.annotations.length ?? 0
  return {
    running: true,
    sessionId: active?.id ?? null,
    pendingCount,
    hasPendingAction: pendingCount > 0,
  }
}

export async function getAnnotations(): Promise<
  { annotations: Annotation[]; sessionUrl: string } | { error: string }
> {
  const sessions = await fetchSessions()
  if (!sessions)
    return { error: 'Markup server not running — start npm run dev first' }
  const active = sessions[sessions.length - 1]
  if (!active) return { annotations: [], sessionUrl: '' }
  // Use the lastAction snapshot (set when Send is clicked) — survives toolbar clears
  const annotations = active.lastAction?.annotations ?? []
  return { annotations, sessionUrl: active.url }
}

export async function resolveAnnotation(
  id: string,
): Promise<{ success: true; id: string } | { error: string }> {
  const bases = await liveBases()
  if (bases.length === 0) return { error: 'Markup server not running — start npm run dev first' }
  const sessions = await fetchSessions()
  // Prefer the active session's server; otherwise the sole/first live one.
  const base = sessions?.[sessions.length - 1]?.base ?? bases[0]
  const res = await safeFetch(`${base}/annotations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' }),
  })
  if (!res) return { error: 'Markup server not running — start npm run dev first' }
  if (!res.ok) return { error: `Failed to resolve annotation: HTTP ${res.status}` }
  return { success: true, id }
}
