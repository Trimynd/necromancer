// Types, the event reducer, and small parsers shared by every screen.

export type Status =
  | 'pending' | 'routing' | 'scraping' | 'researching' | 'role_making'
  | 'in_court' | 'summarizing' | 'done' | 'error'

export interface Route { topic: string; complexity: 'simple' | 'complex'; needs_web: boolean; search_queries: string[] }
export interface ResearchRow { query: string; chunks_stored: number; per_source?: Record<string, number> }
export interface Evidence { fact: string; source?: string; source_type?: string }
export interface Case {
  claim: string
  evidence: Evidence[]
  confidence?: number
  emotion?: string
  search_log?: { queries?: string[]; sources_hit?: unknown; unknowns?: string[] }
  raw?: boolean
}
export interface Ruling {
  decision: 'accept' | 'retry'
  reason?: string
  search_quality?: number
  missing_sources?: string[]
  needs_more?: unknown
  guidance?: string
}
export type Phase = 'spawned' | 'researching' | 'thinking' | 'presented' | 'accepted' | 'redoing' | 'sent_back' | 'dropped'
export interface Ghost {
  id: string
  name: string
  phase: Phase
  query?: string
  searches: string[]
  cases: Case[]
  rulings: { attempt: number; ruling: Ruling }[]
  dropped?: string
}
export interface Usage { [model: string]: { calls?: number; input?: number; output?: number; thinking?: number } }

export interface CaseState {
  status: Status
  text?: string
  url?: string
  route?: Route
  research?: ResearchRow[]
  startup?: Record<string, unknown>
  domain?: string
  problemSummary?: string
  ghosts: Ghost[]
  attempt: number
  report: string
  verdict?: string
  usage?: Usage
  calls?: number
  error?: string
}

export const initialState: CaseState = { status: 'pending', ghosts: [], attempt: -1, report: '' }

/** Ghost output is JSON text, maybe in ```json fences, maybe plain prose. */
export function parseCase(output: unknown): Case {
  if (output && typeof output === 'object') return normalizeCase(output as Record<string, unknown>)
  const raw = String(output ?? '')
  const unfenced = raw.replace(/```(?:json)?/gi, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return normalizeCase(JSON.parse(unfenced.slice(start, end + 1))) } catch { /* fall through */ }
  }
  return { claim: raw.trim(), evidence: [], confidence: 0.3, raw: true }
}

function normalizeCase(o: Record<string, unknown>): Case {
  const ev = Array.isArray(o.evidence) ? o.evidence : []
  return {
    claim: String(o.claim ?? ''),
    evidence: ev.map((e) => (typeof e === 'string' ? { fact: e } : (e as Evidence))),
    confidence: typeof o.confidence === 'number' ? o.confidence : Number(o.confidence) || undefined,
    emotion: o.emotion ? String(o.emotion) : undefined,
    search_log: o.search_log as Case['search_log'],
  }
}

const mapGhost = (s: CaseState, id: string, fn: (g: Ghost) => Ghost): CaseState => ({
  ...s,
  ghosts: s.ghosts.map((g) => (g.id === id ? fn(g) : g)),
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reduce(s: CaseState, event: string, d: any): CaseState {
  switch (event) {
    case 'reset':
      return { ...initialState, text: s.text, url: s.url }
    case 'status': {
      const next = { ...s, status: d as Status }
      if (d === 'in_court') next.ghosts = s.ghosts.map((g) => (g.phase === 'spawned' ? { ...g, phase: 'researching' } : g))
      // Fast mode never redoes: a sent-back ghost just stays sent back.
      if (d === 'summarizing' || d === 'done')
        next.ghosts = next.ghosts.map((g) => (g.phase === 'redoing' ? { ...g, phase: 'sent_back' } : g))
      return next
    }
    case 'route':
      return { ...s, route: d }
    case 'research':
      return { ...s, research: d }
    case 'startup_data':
      return { ...s, startup: d }
    case 'manifest':
      return {
        ...s,
        domain: d.domain,
        problemSummary: d.problem_summary,
        ghosts: (d.agents ?? []).map((a: { id: string; name: string; research?: { query?: string }[] }) => ({
          id: a.id,
          name: a.name,
          phase: s.status === 'in_court' ? 'researching' : 'spawned',
          query: a.research?.[0]?.query,
          searches: [],
          cases: [],
          rulings: [],
        })),
      }
    case 'pre_research': {
      let next = s
      for (const [id, rows] of Object.entries(d as Record<string, { query: string }[]>)) {
        next = mapGhost(next, id, (g) => ({
          ...g,
          phase: g.phase === 'researching' || g.phase === 'spawned' ? 'thinking' : g.phase,
          searches: [...g.searches, ...rows.map((r) => r.query)],
          query: rows[rows.length - 1]?.query ?? g.query,
        }))
      }
      return next
    }
    case 'tool_call': {
      const q = d.args?.query ?? d.name
      return mapGhost(s, d.agent_id, (g) => ({ ...g, phase: 'researching', query: q, searches: [...g.searches, q] }))
    }
    case 'agent_output':
      return mapGhost(s, d.agent_id, (g) => ({ ...g, phase: 'presented', cases: [...g.cases, parseCase(d.output)] }))
    case 'ghost_retry': {
      let next = s
      for (const id of d.agent_ids ?? []) next = mapGhost(next, id, (g) => ({ ...g, phase: 'thinking' }))
      return next
    }
    case 'ghost_dropped':
      return mapGhost(s, d.agent_id, (g) => ({ ...g, phase: 'dropped', dropped: d.error }))
    case 'rulings': {
      let next: CaseState = { ...s, attempt: d.attempt }
      for (const [id, r] of Object.entries(d.rulings as Record<string, Ruling>)) {
        next = mapGhost(next, id, (g) => ({
          ...g,
          phase: r.decision === 'accept' ? 'accepted' : 'redoing',
          rulings: [...g.rulings, { attempt: d.attempt, ruling: r }],
        }))
      }
      return next
    }
    case 'report_chunk':
      return { ...s, report: s.report + String(d) }
    case 'summary':
      return { ...s, report: String(d) }
    case 'verdict':
      return { ...s, verdict: String(d) }
    case 'usage':
      return { ...s, usage: d }
    case 'call_log':
      return { ...s, calls: Array.isArray(d) ? d.length : s.calls }
    case 'error':
      return { ...s, error: String(d) }
    default:
      return s
  }
}

/** Build a finished state straight from GET /api/session/:id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromSnapshot(snap: any): CaseState {
  const cases = (snap.cases ?? {}) as Record<string, Record<string, unknown> & { ruling?: Ruling }>
  const agents = snap.manifest?.agents ?? []
  return {
    ...initialState,
    status: snap.status ?? 'pending',
    text: snap.problem_statement ?? snap.question ?? undefined,
    url: snap.input_url ?? undefined,
    route: snap.route ?? undefined,
    startup: snap.startup_data ?? undefined,
    domain: snap.manifest?.domain,
    problemSummary: snap.manifest?.problem_summary,
    ghosts: agents.map((a: { id: string; name: string }) => {
      const c = cases[a.id]
      const ruling = c?.ruling
      return {
        id: a.id,
        name: a.name,
        phase: !c ? 'dropped' : !ruling ? 'presented' : ruling.decision === 'accept' ? 'accepted' : 'sent_back',
        dropped: c ? undefined : 'No case on file.',
        searches: ((c?.search_log as { queries?: string[] })?.queries) ?? [],
        cases: c ? [parseCase(c)] : [],
        rulings: ruling ? [{ attempt: 0, ruling }] : [],
      } as Ghost
    }),
    report: snap.summary ?? '',
    verdict: snap.verdict ?? undefined,
    usage: snap.usage ?? undefined,
    error: snap.error ?? undefined,
  }
}

export type Family = 'go' | 'caution' | 'stop'
/** "**NO-GO (at the current price point)**\n**Confidence: 80%**\n…" -> label, family, confidence, body. */
export function parseVerdict(text?: string) {
  if (!text) return null
  const t = text.replace(/^\s*#+\s*1\.\s*Verdict\s*/i, '')
  const m = t.match(/\*\*([^*]+)\*\*/)
  const label = m && !/^confidence/i.test(m[1]) ? m[1].trim() : undefined
  const conf = t.match(/confidence[^0-9]{0,5}(\d{1,3})\s*%/i)
  const body = t
    .replace(label ? m![0] : '', '')
    .replace(/\*\*\s*confidence[^*]*\*\*/i, '')
    .trim()
  return { label, family: label ? familyOf(label) : undefined, confidence: conf ? Number(conf[1]) : undefined, body }
}

export function familyOf(label: string): Family | undefined {
  const l = label.toLowerCase()
  if (/no[\s-]?go|stop|kill|abandon|dead|reject|don'?t|do not|shut/.test(l)) return 'stop'
  if (/pivot|condition|caution|wait|recoverable|maybe|revise|hold|partial|test/.test(l)) return 'caution'
  if (/\bgo\b|launch|revive|proceed|yes|build|grow|viable|scale/.test(l)) return 'go'
  return undefined
}

export function initials(name: string) {
  const head = name.split(/[,(]/)[0]
  const words = head.split(/\s+/).filter((w) => w && !/^(the|a|an|of)$/i.test(w))
  return (words.slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase()
}

export const sumSources = (rows?: { per_source?: Record<string, number>; chunks_stored?: number }[]) =>
  (rows ?? []).reduce(
    (n, r) => n + (r.per_source ? Object.values(r.per_source).reduce((a, b) => a + (Number(b) || 0), 0) : r.chunks_stored ?? 0),
    0,
  )

// ---- recent cases (localStorage) ----
export interface Recent { id: string; title: string; text?: string; url?: string; depth?: string; at: number; verdict?: string }
export function loadRecent(): Recent[] {
  try { return JSON.parse(localStorage.getItem('recent-cases') || '[]') } catch { return [] }
}
export function saveRecent(r: Recent) {
  try {
    const list = [r, ...loadRecent().filter((x) => x.id !== r.id)].slice(0, 5)
    localStorage.setItem('recent-cases', JSON.stringify(list))
  } catch { /* storage blocked */ }
}
export function patchRecent(id: string, patch: Partial<Recent>) {
  const found = loadRecent().find((x) => x.id === id)
  if (found) saveRecent({ ...found, ...patch })
}

export const isMock = () =>
  import.meta.env.VITE_USE_MOCK === 'true' || new URLSearchParams(location.search).get('mock') === '1'

export async function startCase(body: { text?: string; url?: string; depth: string }): Promise<string> {
  if (isMock()) return 'mock-' + Date.now().toString(36)
  const res = body.text
    ? await fetch('/api/problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_statement: body.text, depth: body.depth }),
      })
    : await fetch('/api/revive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: body.url }),
      })
  if (!res.ok) throw new Error(`The court couldn't open the case (${res.status}).`)
  return (await res.json()).session_id
}
