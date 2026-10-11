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
  /** Search queries per round (index = round - 1), for the testimony timeline. */
  roundSearches?: string[][]
  persona?: string
}
export interface Doc { id: string; name: string; kind: string; chars?: number; pages?: number | null; preview?: string }
export interface Scores { overall: number; label?: string; dimensions?: Record<string, number> }
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
  documents?: Doc[]
  scores?: Scores
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

/** Round a ghost is in / was last ruled in: 1 + number of times it was sent back. */
export const roundOf = (g: Ghost) => 1 + g.rulings.filter((r) => r.ruling.decision === 'retry').length

const addSearch = (g: Ghost, qs: string[]) => {
  const rounds = (g.roundSearches ?? []).slice()
  const i = roundOf(g) - 1
  rounds[i] = [...(rounds[i] ?? []), ...qs]
  return rounds
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
        ghosts: (d.agents ?? []).map((a: { id: string; name: string; system_prompt?: string; research?: { query?: string }[] }) => ({
          id: a.id,
          name: a.name,
          phase: s.status === 'in_court' ? 'researching' : 'spawned',
          query: a.research?.[0]?.query,
          persona: a.system_prompt || undefined,
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
          roundSearches: addSearch(g, rows.map((r) => r.query)),
          query: rows[rows.length - 1]?.query ?? g.query,
        }))
      }
      return next
    }
    case 'tool_call': {
      const q = d.args?.query ?? d.name
      return mapGhost(s, d.agent_id, (g) => ({ ...g, phase: 'researching', query: q, searches: [...g.searches, q], roundSearches: addSearch(g, [q]) }))
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
    case 'documents':
      return { ...s, documents: d?.items ?? d }
    case 'scores':
      return { ...s, scores: d }
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
        persona: (a as { system_prompt?: string }).system_prompt,
        searches: ((c?.search_log as { queries?: string[] })?.queries) ?? [],
        cases: c ? [parseCase(c)] : [],
        rulings: ruling ? [{ attempt: 0, ruling }] : [],
      } as Ghost
    }),
    report: snap.summary ?? '',
    documents: snap.documents ?? undefined,
    scores: snap.scores ?? undefined,
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
export interface Recent {
  id: string; title: string; text?: string; url?: string; depth?: string; at: number; verdict?: string; document_ids?: string[]; strict?: boolean
  /** Follow-ups: the case this one continues, and the first case of the thread. */
  parent?: string; root?: string
}
export function loadRecent(): Recent[] {
  try { return JSON.parse(localStorage.getItem('recent-cases') || '[]') } catch { return [] }
}
export function saveRecent(r: Recent) {
  try {
    const list = [r, ...loadRecent().filter((x) => x.id !== r.id)].slice(0, 20)
    localStorage.setItem('recent-cases', JSON.stringify(list))
  } catch { /* storage blocked */ }
}
export function patchRecent(id: string, patch: Partial<Recent>) {
  const found = loadRecent().find((x) => x.id === id)
  if (found) saveRecent({ ...found, ...patch })
}

export const isMock = () =>
  import.meta.env.VITE_USE_MOCK === 'true' || new URLSearchParams(location.search).get('mock') === '1'

/** POST /api/documents (multipart, field "files"). Throws with the server's `detail` on 400. */
export async function uploadDocuments(files: File[]): Promise<Doc[]> {
  if (isMock()) return files.map((f, i) => ({ id: `mock-doc-${i}`, name: f.name, kind: kindOf(f.name), chars: f.size }))
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  const res = await fetch('/api/documents', { method: 'POST', body: fd })
  if (!res.ok) {
    let detail = `Upload failed (${res.status}).`
    try { detail = (await res.json()).detail ?? detail } catch { /* not json */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return (await res.json()).documents ?? []
}

export const kindOf = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'pdf' ? 'pdf' : ext === 'csv' ? 'csv' : ext === 'docx' ? 'docx' : ext === 'xlsx' || ext === 'xlsm' ? 'excel' : 'text'
}
export const DOC_ICON: Record<string, string> = { pdf: '📕', csv: '📊', docx: '📘', excel: '📗', text: '📄' }

// ---------- Excel compare (POST /api/compare): verdicts computed in code, plus cell diffs ----------

export interface LedgerVerdict {
  overall: number | null; label: string; mode: string | null; headline: string
  dimensions: Record<string, number>; kpis: Record<string, number>
}
export interface Ledger {
  index: number; name: string; document_id: string; verdict: LedgerVerdict
  financials: { sheet: string | null; periods: string[]; series: Record<string, (number | null)[]>; metrics: Record<string, string> }
}
export interface CellChange { sheet: string; row: string; column: string; a: unknown; b: unknown; delta: number | null; pct: number | null }
export interface LedgerDiff {
  from: number; to: number
  cells: {
    changes: CellChange[]; total_changed: number; paired_by: 'label' | 'position'
    added_rows: string[]; removed_rows: string[]; added_columns: string[]; removed_columns: string[]
  }
  verdict: {
    overall: { a: number | null; b: number | null; delta: number | null }
    label: { a: string; b: string; changed: boolean }
    dimensions: { key: string; label: string; a: number | null; b: number | null; delta: number | null }[]
    kpis: { key: string; label: string; a: number | null; b: number | null; delta: number | null; pct: number | null }[]
    drivers: string[]
  }
}
export interface Comparison { workbooks: Ledger[]; diffs: Record<string, LedgerDiff> }

/** 2-6 spreadsheets, oldest first. Throws with the server's `detail` on 400. */
export async function compareWorkbooks(files: File[]): Promise<Comparison> {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  let res: Response
  try {
    res = await fetch('/api/compare', { method: 'POST', body: fd })
  } catch {
    throw new Error('Could not reach the backend. Is it running on port 8000?')
  }
  if (!res.ok) {
    // Vite's proxy answers 5xx with no JSON when the backend isn't running.
    let detail: unknown = res.status >= 500 ? 'The backend failed or is not running on port 8000.' : `Compare failed (${res.status}).`
    try { detail = (await res.json()).detail ?? detail } catch { /* not json */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export async function startCase(body: { text?: string; url?: string; depth: string; document_ids?: string[]; strict?: boolean }): Promise<string> {
  if (isMock()) return 'mock-' + Date.now().toString(36)
  const res = await fetch('/api/problem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problem_statement: body.text ?? '', url: body.url || null, depth: body.depth, document_ids: body.document_ids ?? [], strict: !!body.strict,
    }),
  })
  if (!res.ok) throw new Error(`The court couldn't open the case (${res.status}).`)
  return (await res.json()).session_id
}

/** POST /api/session/:id/followup -> the new (child) session id. */
export async function followUp(id: string, body: { question: string; depth: string; strict?: boolean }): Promise<string> {
  if (isMock() || id.startsWith('mock-')) return 'mock-' + Date.now().toString(36)
  const res = await fetch(`/api/session/${id}/followup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: body.question, depth: body.depth, strict: !!body.strict }),
  })
  if (!res.ok) throw new Error(`The court couldn't take the follow-up (${res.status}).`)
  return (await res.json()).session_id
}

// ---- conversation thread ----
export interface ThreadItem { session_id: string; question?: string; verdict?: string | null; status?: string }
/** Mock mode has no server: rebuild the ancestor chain from recent cases. */
export function threadFromRecent(id: string): ThreadItem[] {
  const all = loadRecent()
  const out: ThreadItem[] = []
  for (let p = all.find((r) => r.id === id)?.parent; p; ) {
    const r = all.find((x) => x.id === p)
    if (!r) break
    out.unshift({ session_id: r.id, question: r.text || r.title, verdict: r.verdict, status: 'done' })
    p = r.parent
  }
  return out
}
export const rootOf = (id: string) => loadRecent().find((r) => r.id === id)?.root ?? id

// ---- recorded event lists ----
export interface Recorded { event: string; data: unknown }
export const reduceAll = (events: Recorded[], base: CaseState) => events.reduce((s, e) => reduce(s, e.event, e.data), base)

const EV_KEY = 'case-events'
const EV_MAX = 10
const EV_BYTES = 2_000_000
type EvCache = Record<string, { status: string; events: Recorded[]; at: number }>
const readEv = (): EvCache => { try { return JSON.parse(localStorage.getItem(EV_KEY) || '{}') } catch { return {} } }
export const loadCachedEvents = (id: string) => readEv()[id]
/** Keep the last 10 finished runs (~2 MB cap, oldest dropped first) so recent cases reopen instantly, even offline. */
export function cacheEvents(id: string, status: string, events: Recorded[]) {
  // The reducer only counts call_log entries; don't spend storage on their contents.
  const slim = events.map((e) => (e.event === 'call_log' && Array.isArray(e.data) ? { ...e, data: e.data.map(() => 0) } : e))
  const all = { ...readEv(), [id]: { status, events: slim, at: Date.now() } }
  const ids = Object.keys(all).sort((a, b) => all[b].at - all[a].at)
  let json = ''
  while (ids.length) {
    json = JSON.stringify(Object.fromEntries(ids.slice(0, EV_MAX).map((k) => [k, all[k]])))
    if (json.length <= EV_BYTES || ids.length === 1) break
    ids.pop()
  }
  try { localStorage.setItem(EV_KEY, json) } catch { /* quota or blocked: cache is best-effort */ }
}

/** GET /api/session/:id/events -> null on 404 (older backend / unknown id). */
export async function fetchEvents(id: string): Promise<{ status: string; events: Recorded[] } | null> {
  const res = await fetch(`/api/session/${id}/events`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

/** Verdict text, or the "## 1. Verdict" section of the report while it's still streaming. */
export function verdictText(s: CaseState) {
  if (s.verdict) return s.verdict
  const m = s.report.match(/##\s*1\.\s*Verdict[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i)
  return m?.[1]?.trim() ? m[1] : undefined
}

// ---- highlighting numbers / money / percentages / dates in testimony ----
const MONTH = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`
const NUM = String.raw`(?:Rs\.?\s?)?[₹$€£]?\d(?:[\d,]*\d)?(?:\.\d+)?`
const UNIT = String.raw`(?:\s?(?:%|k\b|lakh\b|crore\b|cr\b|L\b|M\b|B\b|bn\b|km\b))?(?:\/(?:month|mo|meal|year|yr|day))?`
const HIGHLIGHT = new RegExp(
  String.raw`(\b\d{1,2}\s${MONTH}(?:\s\d{4})?\b|\b${MONTH}\s\d{4}\b|${NUM}(?:\s?(?:–|-|to)\s?${NUM})?${UNIT})`,
  'g',
)
/** Splits text into [plain, match, plain, match, …]; odd indexes are numbers, money, % or dates. */
export const splitHighlights = (t: string) => t.split(HIGHLIGHT)
