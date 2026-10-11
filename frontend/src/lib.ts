// Types, the event reducer, and small parsers shared by every screen.

export type Status =
  | 'pending' | 'routing' | 'scraping' | 'researching' | 'role_making'
  | 'in_court' | 'summarizing' | 'done' | 'error' | 'interrupted'

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
export interface ColStat { first: number; last: number; min: number; max: number; change_pct: number | null; trend: 'up' | 'down' | 'flat' }
export interface Table { columns: string[]; rows: (string | number)[][] }
export interface Doc {
  id: string; name: string; kind: string; chars?: number; pages?: number | null; preview?: string
  /** csv / sheet only: the parsed table (≤ 200 rows, header excluded) and per-numeric-column stats. */
  table?: Table; stats?: Record<string, ColStat>
}
/** Same shape the backend sends: stats for every column whose cells are all numbers. */
export function statsOf(t: Table): Record<string, ColStat> {
  const out: Record<string, ColStat> = {}
  t.columns.forEach((c, i) => {
    const raw = t.rows.map((r) => r[i]).filter((v) => v !== '' && v != null)
    const xs = raw.map((v) => (typeof v === 'number' ? v : Number(String(v).replace(/[,₹$%\s]/g, ''))))
    if (!xs.length || xs.some((x) => !Number.isFinite(x))) return
    const first = xs[0], last = xs[xs.length - 1]
    const change_pct = first ? Math.round(((last - first) / Math.abs(first)) * 1000) / 10 : null
    out[c] = { first, last, min: Math.min(...xs), max: Math.max(...xs), change_pct,
      trend: change_pct == null || Math.abs(change_pct) < 1 ? 'flat' : change_pct > 0 ? 'up' : 'down' }
  })
  return out
}
export interface Plain {
  verdict_in_plain_words?: string
  what_this_means?: string
  confidence_in_plain_words?: string
  dimension_notes?: Record<string, string>
}
export interface Scores { overall?: number; label?: string; dimensions?: Record<string, number>; plain?: Plain }
export interface PlanTask {
  id?: string; title?: string; phase?: string; start_week?: number; end_week?: number
  owner?: string; why?: string; success_metric?: string; depends_on?: string[]
}
export interface Plan {
  horizon_days?: number; goal?: string; first_step_this_week?: string
  phases?: { name?: string; start_week?: number; end_week?: number }[]
  tasks?: PlanTask[]
  review?: { strengths?: string[]; risks?: string[]; stop_doing?: string[] }
}
export type Stage = 'launch' | 'grow' | 'rescue' | 'revive'
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
  plan?: Plan
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
      if (d === 'summarizing' || d === 'done' || d === 'interrupted')
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
      return d && typeof d === 'object' ? { ...s, scores: d } : s
    case 'plan':
      return d && typeof d === 'object' ? { ...s, plan: d } : s
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
    plan: snap.plan ?? undefined,
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
  id: string; title: string; text?: string; url?: string; depth?: string; at: number; verdict?: string; document_ids?: string[]; strict?: boolean; stage?: Stage
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

const mockParam = () => new URLSearchParams(location.search).get('mock')
export const isMock = () => import.meta.env.VITE_USE_MOCK === 'true' || mockParam() === '1' || mockParam() === 'interrupted'
/** ?mock=interrupted plays a run that stops mid-court, as after a server restart. */
export const mockInterrupted = () => mockParam() === 'interrupted'
/** Query string that keeps the current mock variant across navigation. */
export const mockQ = () => (isMock() ? `?mock=${mockParam() ?? '1'}` : '')

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

/** POST /api/connectors/google-sheet -> the sheet as a document. Throws with the server's `detail` on 400. */
export async function connectSheet(url: string): Promise<Doc[]> {
  const res = await fetch('/api/connectors/google-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  if (!res.ok) {
    let detail: unknown = `Couldn't connect the sheet (${res.status}).`
    try { detail = (await res.json()).detail ?? detail } catch { /* not json */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return (await res.json()).documents ?? []
}

export const kindOf = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'pdf' ? 'pdf' : ext === 'csv' ? 'csv' : ext === 'docx' ? 'docx' : 'text'
}
export const DOC_ICON: Record<string, string> = { pdf: '📕', csv: '📊', sheet: '📗', docx: '📘', text: '📄' }
export const docLabel = (d: Doc) =>
  d.table ? `${d.kind === 'sheet' ? 'Google Sheet · ' : ''}${d.table.rows.length} rows × ${d.table.columns.length} columns`
    : d.pages ? `${d.pages} pages` : d.chars ? `${Math.max(1, Math.round(d.chars / 1000))}k chars` : ''

export async function startCase(body: { text?: string; url?: string; depth: string; document_ids?: string[]; strict?: boolean; stage?: Stage }): Promise<string> {
  if (isMock()) return 'mock-' + Date.now().toString(36)
  const res = await fetch('/api/problem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problem_statement: body.text ?? '', url: body.url || null, depth: body.depth, document_ids: body.document_ids ?? [], strict: !!body.strict,
      stage: body.stage ?? null,
    }),
  })
  if (!res.ok) throw new Error(`The court couldn't open the case (${res.status}).`)
  return (await res.json()).session_id
}

/** POST /api/session/:id/followup -> the new (child) session id. */
export async function followUp(id: string, body: { question: string; depth: string; strict?: boolean; stage?: Stage }): Promise<string> {
  if (isMock() || id.startsWith('mock-')) return 'mock-' + Date.now().toString(36)
  const res = await fetch(`/api/session/${id}/followup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: body.question, depth: body.depth, strict: !!body.strict, stage: body.stage ?? null }),
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

// ---- 90-day plan exports ----
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
export function planCsv(p: Plan) {
  const rows = [['Task', 'Phase', 'Start week', 'End week', 'Owner', 'Success looks like', 'Why', 'Needs first']]
  for (const t of p.tasks ?? [])
    rows.push([t.title, t.phase, t.start_week, t.end_week, t.owner, t.success_metric, t.why, (t.depends_on ?? []).join(' ')].map((x) => String(x ?? '')))
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
}
export function planMd(p: Plan) {
  const out = [`## Your ${p.horizon_days ?? 90}-day plan`]
  if (p.goal) out.push(`**Goal:** ${p.goal}`)
  if (p.first_step_this_week) out.push(`**Do this first (this week):** ${p.first_step_this_week}`)
  if (p.tasks?.length) {
    const cell = (x?: string) => (x ?? '').replace(/\|/g, '/')
    out.push(['| Task | Weeks | Owner | Success looks like |', '|---|---|---|---|',
      ...p.tasks.map((t) => `| ${cell(t.title)} | W${t.start_week ?? '?'}–W${t.end_week ?? t.start_week ?? '?'} | ${cell(t.owner)} | ${cell(t.success_metric)} |`)].join('\n'))
  }
  const r = p.review
  const list = (h: string, xs?: string[]) => xs?.length && out.push(`### ${h}`, xs.map((x) => `- ${x}`).join('\n'))
  if (r) { list("What's working for you", r.strengths); list('What could hurt you', r.risks); list('Stop doing', r.stop_doing) }
  return out.join('\n\n')
}
