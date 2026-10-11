import { lazy, Suspense, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Courtroom } from './Courtroom'
import { Md, Report } from './Report'
import { TestimonyCard, TestimonyPanel } from './Ghost'
import {
  cacheEvents, dataUpdateLabel, DOC_ICON, docLabel, mockInterrupted, planMd, fetchEvents, followUp, fromSnapshot, initialState, isMock, loadCachedEvents, loadRecent, over, parseVerdict, patchRecent,
  reduce, reduceAll, rootOf, saveRecent, startCase, sumSources, threadFromRecent, verdictText,
  type CaseState, type Recorded, type ThreadItem,
} from './lib'
import { MOCK_SHEET, MOCK_TEXT, playMock } from './mock'
import { FollowUpBox, LiveSteps, Thread } from './Thread'
import { explainLabel, Gauge, PlainVerdict, PlanSection, Review } from './Plan'
import { DataChanged, SheetRefresh, UpdateData } from './Sheet'

// recharts is the heavy part of the bundle; only fetch it once a case has something to chart.
const loadDashboard = () => import('./Dashboard')
const Dashboard = lazy(() => loadDashboard().then((m) => ({ default: m.Dashboard })))
const Numbers = lazy(() => loadDashboard().then((m) => ({ default: m.Numbers })))

const EVENTS = [
  'status', 'documents', 'scores', 'plan', 'route', 'research', 'startup_data', 'manifest', 'pre_research', 'tool_call', 'agent_output', 'ghost_retry',
  'ghost_dropped', 'window', 'data_changed', 'rulings', 'report_chunk', 'verdict', 'summary', 'usage', 'call_log', 'error',
]

type Action =
  | { event: 'load'; data: CaseState }
  | { event: 'replay'; data: Recorded[] }
  | { event: 'patch'; data: Partial<CaseState> }
  | { event: string; data: unknown }
const reducer = (s: CaseState, a: Action): CaseState => {
  if (a.event === 'load') return a.data as CaseState
  // A whole recorded run in one pass: no per-event renders, no animations.
  if (a.event === 'replay') return reduceAll(a.data as Recorded[], { ...initialState, text: s.text, url: s.url })
  if (a.event === 'patch') return { ...s, ...(a.data as Partial<CaseState>) }
  return reduce(s, a.event, a.data)
}

type Meta = { parent_id?: string | null; thread: ThreadItem[] }

/**
 * Owns the connection. Finished runs (from the local cache, then GET /events) are reduced in one pass and render
 * instantly; live runs reduce what's recorded so far, then follow the SSE stream. Old backends (no /events) fall
 * back to the snapshot.
 */
function useCaseStream(id: string) {
  const recent = loadRecent().find((r) => r.id === id)
  const mock = isMock() || id.startsWith('mock-')
  const [cached] = useState(() => loadCachedEvents(id))
  const [s, dispatch] = useReducer(reducer, null, () => {
    const base = { ...initialState, text: mock && !recent ? MOCK_TEXT : recent?.text, url: recent?.url }
    return cached ? reduceAll(cached.events, base) : base
  })
  // 'saved': the server no longer knows this case, but this browser kept a copy.
  const [conn, setConn] = useState<'connecting' | 'live' | 'reconnecting' | 'closed' | 'missing' | 'saved'>(over(cached?.status) ? 'closed' : 'connecting')
  const [meta, setMeta] = useState<Meta>(() => ({ parent_id: recent?.parent ?? null, thread: threadFromRecent(id) }))

  useEffect(() => {
    if (mock) {
      if (cached) return
      setConn('live')
      const rec: Recorded[] = []
      return playMock((event, data) => {
        rec.push({ event, data })
        dispatch({ event, data })
        if (event === 'status' && over(data as string)) { cacheEvents(id, data as string, rec); setConn('closed') }
      }, { url: recent?.url, sheet: recent?.document_ids?.includes(MOCK_SHEET.id), interrupted: mockInterrupted(), dataUpdate: !!dataUpdateLabel(recent?.text) })
    }
    let es: EventSource | undefined
    let poll: ReturnType<typeof setInterval> | undefined
    let dead = false
    // `rec` mirrors what the state was built from (listened-to events only, in server order). `known` = the state
    // holds exactly `rec`, so a (re)connect, which replays the whole run, skips what we already have instead of
    // resetting the page.
    let rec: Recorded[] = []
    let known = false
    let status = cached?.status ?? 'pending'
    let savedAt = 0
    // Write what's known so far to the local cache: on every status change and at most every 5 s otherwise.
    const save = (force: boolean) => {
      if (!force && Date.now() - savedAt < 5000) return
      savedAt = Date.now()
      cacheEvents(id, status, rec)
    }
    const replay = (r: { status: string; events: Recorded[] }) => {
      dispatch({ event: 'replay', data: r.events })
      cacheEvents(id, r.status, r.events)
      rec = r.events.filter((e) => EVENTS.includes(e.event))
      known = true
      status = r.status
    }

    const snapshot = async () => {
      const res = await fetch(`/api/session/${id}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(String(res.status))
      return res.json()
    }
    // Last resort after the stream failed 4 times: poll the recorded events until the run ends (or vanishes).
    const pollUntilDone = () => {
      poll = setInterval(async () => {
        try {
          const r = await fetchEvents(id)
          if (dead) return
          if (!r) { clearInterval(poll); setConn(cached ? 'saved' : 'missing'); return }
          replay(r)
          if (over(r.status)) { clearInterval(poll); setConn('closed') }
        } catch { /* server down: keep polling */ }
      }, 3000)
    }
    // Pull the complete record of a finished run (anything that landed after the final status) and cache it.
    const settle = async () => {
      try {
        const r = await fetchEvents(id)
        if (!dead && r && over(r.status)) replay(r)
      } catch { /* keep what we have */ }
    }
    const open = (retries: number) => {
      es = new EventSource(`/api/stream/${id}`)
      let skip = 0
      es.onopen = () => {
        setConn('live')
        if (known) skip = rec.length
        else { dispatch({ event: 'reset', data: null }); rec = []; known = true }
      }
      for (const name of EVENTS) {
        es.addEventListener(name, (e) => {
          let data: unknown = (e as MessageEvent).data
          try { data = JSON.parse(data as string) } catch { /* plain string */ }
          const final = name === 'status' && over(data as string)
          // Already applied (the server replays from the start). A final status always applies: a restarted
          // server may have saved fewer events than we saw, then appends "interrupted".
          if (skip > 0 && !final) { skip--; return }
          skip = 0
          dispatch({ event: name, data })
          rec.push({ event: name, data })
          if (name === 'status') status = data as string
          save(name === 'status')
          if (final) {
            es?.close()
            setConn('closed')
            setTimeout(settle, 1500)
          }
        })
      }
      es.onerror = () => {
        if (dead || es?.readyState === EventSource.OPEN) return
        es?.close()
        if (retries > 0) {
          setConn('reconnecting')
          setTimeout(() => !dead && open(retries - 1), (4 - retries) * 1500)
        } else pollUntilDone()
      }
    }

    // Question, website and thread come from the session; events carry the rest.
    const meta = snapshot()
    meta
      .then((snap) => {
        if (dead || !snap) return
        dispatch({ event: 'patch', data: { text: snap.problem_statement || snap.question || recent?.text, url: snap.input_url ?? snap.url ?? recent?.url } })
        setMeta({ parent_id: snap.parent_id ?? null, thread: snap.thread ?? [] })
      })
      .catch(() => {})

    // Pre-/events backend: the old snapshot path.
    const legacy = () =>
      meta.then((snap) => {
        if (dead) return
        if (!snap) return setConn(cached ? 'saved' : 'missing')
        if (over(snap.status)) {
          dispatch({ event: 'load', data: { ...fromSnapshot(snap), text: snap.problem_statement || recent?.text, url: snap.input_url ?? recent?.url } })
          setConn('closed')
        } else open(3)
      })

    fetchEvents(id)
      .then((r) => {
        if (dead) return
        if (!r) return legacy()
        replay(r)
        if (over(r.status)) setConn('closed')
        else open(3)
      })
      .catch(() => !dead && !over(cached?.status) && open(3))

    return () => { dead = true; es?.close(); clearInterval(poll) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return { s, conn, meta }
}

// ---- the stepper: one step on screen at a time ----
type StepKey = 'read' | 'research' | 'council' | 'rulings' | 'verdict' | 'plan' | 'details' | 'followup'
const STEP_NAME: Record<StepKey, string> = {
  read: 'Read', research: 'Research', council: 'Council', rulings: 'Rulings', verdict: 'Verdict', plan: 'Plan', details: 'Details', followup: 'Follow-up',
}
const FULL: StepKey[] = ['read', 'research', 'council', 'rulings', 'verdict', 'plan', 'details', 'followup']
const SIMPLE: StepKey[] = ['read', 'research', 'verdict', 'followup']

/** The step the run has reached (live), or the furthest step with something to show (stopped early). */
function reachedStep(s: CaseState): StepKey {
  switch (s.status) {
    case 'pending': case 'routing': case 'scraping': return 'read'
    case 'researching': return 'research'
    case 'role_making': return 'council'
    case 'in_court': return s.ghosts.some((g) => g.cases.length) ? 'rulings' : 'council'
    case 'summarizing': case 'done': return 'verdict'
    default:
      return s.report || s.verdict || s.scores ? 'verdict' : s.ghosts.some((g) => g.cases.length) ? 'rulings'
        : s.ghosts.length ? 'council' : s.research ? 'research' : 'read'
  }
}

function StepBar({ steps, at, live, enabled, go }: { steps: StepKey[]; at: StepKey; live?: StepKey; enabled: (k: StepKey) => boolean; go: (k: StepKey) => void }) {
  const li = live ? steps.indexOf(live) : steps.length
  return (
    <nav aria-label="Steps" className="no-print">
      <ol className="flex gap-1 overflow-x-auto pb-1 text-sm [scrollbar-width:none]">
        {steps.map((k, i) => {
          const on = k === at
          const done = i < li
          return (
            <li key={k} className="shrink-0">
              <button
                type="button"
                disabled={!enabled(k)}
                onClick={() => go(k)}
                aria-current={on ? 'step' : undefined}
                className={`step-tab ${on ? 'on' : ''}`}
              >
                <span aria-hidden className={k === live ? 'text-seal' : done ? 'fam-go' : ''}>{k === live ? '●' : done ? '✓' : '○'}</span>
                {i + 1}. {STEP_NAME[k]}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// One component instance per case, so refs (timers, scroll-once) and the instant first render reset on navigation.
export function CasePage() {
  const { id } = useParams()
  return <CaseView key={id} />
}

function CaseView() {
  const params = useParams()
  const id = params.id ?? ''
  const ghostId = params['*']?.match(/^ghost\/([^/]+)/)?.[1]
  const { search } = useLocation()
  const base = `/case/${id}`
  const nav = useNavigate()
  const { s, conn, meta } = useCaseStream(id)
  // Fetch the charts chunk now, so it's ready by the time scores arrive.
  useEffect(() => { loadDashboard().catch(() => {}) }, [])
  const [since] = useState(() => loadRecent().find((r) => r.id === id)?.at ?? Date.now())
  const ranLive = useRef(false)
  const [t1, setT1] = useState<number>()
  const [retrying, setRetrying] = useState(false)
  const simple = s.route?.complexity === 'simple'
  const finished = over(s.status)
  const interrupted = s.status === 'interrupted'
  const sheets = (s.documents ?? []).filter((d) => d.table?.rows.length)
  // The verdict section lights up as soon as "## 1. Verdict" streams in, before the verdict event.
  const v = parseVerdict(verdictText(s))
  // From the report's "Risks & open questions" (- **Assumption:** …), once it has streamed in.
  const assumption = s.report.match(/\*\*Assumption:?\*\*:?\s*([^\n]+)/i)?.[1]
  if (!finished && s.status !== 'pending') ranLive.current = true
  useEffect(() => { if (finished) setT1((t) => t ?? Date.now()) }, [finished])
  // Recorded run length when we have it; else from when this browser started the case (survives a reload).
  const seconds = !finished ? undefined : s.duration ?? (ranLive.current && t1 ? Math.round((t1 - since) / 1000) : undefined)

  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([s.plan ? `${s.report}

${planMd(s.plan)}
` : s.report], { type: 'text/markdown' }))
    a.download = `necromancer-${(s.text || 'case').slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  useEffect(() => { document.title = s.text ? `${s.text.slice(0, 40)}… · Necromancer` : 'Case · Necromancer' }, [s.text])
  useEffect(() => { if (v?.label && !simple) patchRecent(id, { verdict: v.label }) }, [id, v?.label, simple])

  const tryAgain = async () => {
    setRetrying(true)
    try {
      const old = loadRecent().find((r) => r.id === id)
      const depth = old?.depth ?? 'fast'
      const newId = meta.parent_id && s.text
        ? await followUp(meta.parent_id, { question: s.text, depth, strict: old?.strict, stage: old?.stage })
        : await startCase({ text: s.text, url: s.url, depth, document_ids: old?.document_ids, strict: old?.strict, stage: old?.stage })
      saveRecent({
        id: newId, title: (s.text || s.url || 'Case').slice(0, 80), text: s.text, url: s.url, depth, at: Date.now(), document_ids: old?.document_ids,
        strict: old?.strict, stage: old?.stage, parent: meta.parent_id ?? undefined, root: meta.parent_id ? rootOf(meta.parent_id) : undefined,
      })
      nav(`/case/${newId}${isMock() ? '?mock=1' : ''}`)
    } catch { setRetrying(false) }
  }

  // Steps: follow the run live (pick = null) or stay on the step the user chose.
  const steps = simple ? SIMPLE : FULL
  const reached = reachedStep(s)
  const live = finished ? undefined : reached
  const [pick, setPick] = useState<StepKey | null>(null)
  const at: StepKey = pick && steps.includes(pick) ? pick : steps.includes(reached) ? reached : 'verdict'
  const atIdx = steps.indexOf(at)
  const enabled = (k: StepKey) =>
    s.status === 'done' ? true
      : steps.indexOf(k) <= steps.indexOf(reached) || (k === 'details' && (s.status === 'summarizing' || !!s.report))
  const go = (k: StepKey) => setPick(!finished && k === reached ? null : k)
  const move = (d: 1 | -1) => {
    for (let i = atIdx + d; i >= 0 && i < steps.length; i += d) if (enabled(steps[i])) return go(steps[i])
  }
  // A run that finishes while you watch lands on the verdict page.
  useEffect(() => { if (finished && ranLive.current) setPick(null) }, [finished])
  // Slide direction, and keep the top of the new step in view.
  const lastIdx = useRef(atIdx)
  const dir = atIdx < lastIdx.current ? 'back' : 'fwd'
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (lastIdx.current === atIdx) return
    lastIdx.current = atIdx
    const el = top.current
    if (el && el.getBoundingClientRect().top < 0)
      el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [atIdx])
  // ←/→ between steps (not while typing or reading a testimony).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ghostId || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const t = e.target as HTMLElement
      if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowRight') move(1)
      else if (e.key === 'ArrowLeft') move(-1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  const touch = useRef<{ x: number; y: number }>(undefined)
  const onTouchEnd = (e: React.TouchEvent) => {
    const t0 = touch.current, t = e.changedTouches[0]
    touch.current = undefined
    if (!t0 || !t) return
    const dx = t.clientX - t0.x, dy = t.clientY - t0.y
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) move(dx < 0 ? 1 : -1)
  }

  if (conn === 'missing')
    return (
      <div className="mx-auto max-w-[68ch] py-16 text-center">
        <p className="font-serif text-[28px]">We couldn't find that case.</p>
        <Link to="/" className="mt-4 inline-block text-seal underline">Start a new case</Link>
      </div>
    )

  const tokens = Object.values(s.usage ?? {}).reduce((n, u) => n + (u.input ?? 0) + (u.output ?? 0) + (u.thinking ?? 0), 0)
  const calls = Object.values(s.usage ?? {}).reduce((n, u) => n + (u.calls ?? 0), 0) || s.calls
  const sheetDocs = (s.documents ?? []).filter((d) => d.kind === 'sheet')
  const update = dataUpdateLabel(s.text)
  const prev = steps.slice(0, atIdx).reverse().find(enabled)
  const courtroom = !simple && <Courtroom s={s} ghostHref={(gid) => `${base}/ghost/${gid}${search}`} />
  const numbers = sheets.length > 0 && (
    <Suspense fallback={<div className="entry space-y-2" aria-label="Loading your numbers"><div className="skel w-full" /><div className="skel w-5/6" /></div>}>
      {sheets.map((d) => <Numbers key={d.id} doc={d} />)}
    </Suspense>
  )
  const actions = s.status === 'done' && (
    <div className="no-print mt-6 flex flex-wrap gap-2 text-sm">
      <button className="btn btn-seal" onClick={download}>Download report (.md)</button>
      <button className="btn btn-line" onClick={() => print()}>Print / PDF</button>
      <button className="btn btn-line" onClick={() => go('followup')}>Ask a follow-up</button>
      {sheetDocs.length > 0 && <a className="btn btn-line" href="#sheet-refresh">Re-analyse my sheet</a>}
      <button className="btn btn-line" onClick={() => navigator.clipboard?.writeText(location.href)}>Copy link</button>
    </div>
  )

  const pane: Record<StepKey, ReactNode> = {
    read: (
      <>
        <section id="words" className="py-6">
          {update && <p className="eyebrow mb-1">Data update v{update}</p>}
          {s.text ? (
            <p className="max-w-[68ch] font-serif text-[20px] italic leading-snug">“{s.text}”</p>
          ) : (
            <p className="text-ink-soft">{conn === 'connecting' ? 'Opening the case…' : 'Case'}</p>
          )}
          {s.url && <p className="mt-1 text-sm text-ink-soft">Website: <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a></p>}
          {meta.parent_id && (
            <p className="mt-1 text-sm text-ink-soft">
              ↳ Continues from <Link className="underline" to={`/case/${meta.parent_id}${search}`}>case {meta.parent_id.slice(0, 8)}</Link>; the council was
              briefed on its verdict.
            </p>
          )}
          {!finished && <LiveSteps s={s} since={since} />}
        </section>
        {s.dataChanged && <DataChanged sheets={s.dataChanged} />}
        {!!s.documents?.length && (
          <section id="documents" className="entry">
            <h2 className="font-serif text-xl">Documents in evidence</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {s.documents.map((d) => (
                <li key={d.id} className="chip chip-doc flex max-w-full items-center gap-1.5 !px-2.5 !py-1 text-sm" title={d.preview}>
                  <span aria-hidden>{DOC_ICON[d.kind] ?? '📄'}</span>
                  <span className="truncate">{d.name}</span>
                  <span className="shrink-0 opacity-75">{docLabel(d)}{d.version && d.version > 1 ? ` · v${d.version}` : ''}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-ink-soft">Read as data to brief the council, never as instructions.</p>
          </section>
        )}
        {s.route && (
          <section className="entry text-[15px]">
            <span className="text-ink-soft">Read as: </span>
            <span className="font-medium">{s.route.topic.replace(/_/g, ' ')}</span>
            <span className="text-ink-soft"> · {simple ? 'a quick question' : 'needs the full court'}</span>
          </section>
        )}
        {s.startup && (
          <section className="entry text-[15px]">
            <h2 className="font-serif text-xl">The old website</h2>
            <StartupInfo d={s.startup} />
          </section>
        )}
      </>
    ),
    research: (
      <>
        {s.research ? (
          <section id="research" className="entry">
            <h2 className="font-serif text-[28px]">Research</h2>
            <p className="text-sm text-ink-soft">{s.research.length} searches, {sumSources(s.research)} sources</p>
            <ul className="mt-2 space-y-1 text-sm">
              {s.research.map((r, i) => (
                <li key={i}>
                  <span className="font-medium">{r.query}</span>
                  <span className="text-ink-soft">
                    {' '}· {r.chunks_stored} stored
                    {r.per_source && ' · ' + Object.entries(r.per_source).map(([k, n]) => `${k === 'document' ? 'your documents' : k} ${n}`).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="entry text-ink-soft">{finished ? 'No web research was needed for this one.' : <LiveSteps s={s} since={since} />}</section>
        )}
        {numbers}
      </>
    ),
    council: (
      <>
        {finished ? (s.ghosts.length ? courtroom : <section className="entry text-ink-soft">No council was summoned.</section>) : <section className="entry text-ink-soft"><LiveSteps s={s} since={since} /></section>}
        {s.ghosts.length > 0 && (
          <section id="council" className="entry">
            <h2 className="font-serif text-[28px]">The council assembled</h2>
            {s.problemSummary && <p className="mt-1 max-w-[68ch] font-serif text-[18px]">{s.problemSummary}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {s.ghosts.map((g, i) => (
                <Link key={g.id} to={`${base}/ghost/${g.id}${search}`} className="appear chip !px-2.5 !py-1 text-sm" style={{ animationDelay: `${i * 120}ms`, borderColor: 'var(--ghost)' }}>
                  {g.name}
                </Link>
              ))}
            </div>
          </section>
        )}
      </>
    ),
    rulings: (
      <>
        <section id="testimony" className="entry">
          <h2 className="font-serif text-[28px]">Testimony and rulings</h2>
          <div className="mt-2 divide-y divide-hair">
            {s.ghosts.map((g) => <TestimonyCard key={g.id} g={g} href={`${base}/ghost/${g.id}${search}`} />)}
          </div>
        </section>
      </>
    ),
    verdict: simple ? (
      <section id="verdict" className="entry">
        <h2 className="font-serif text-[28px]">The answer</h2>
        <p className="mb-2 text-sm text-ink-soft">This was a quick question, so no court was needed.</p>
        {s.verdict || s.report ? <div className="md bar-seal"><Md>{s.report || s.verdict || ''}</Md></div> : <LiveSteps s={s} since={since} />}
      </section>
    ) : (
      <>
        {v || s.scores || !finished ? (
          <div className="grid gap-x-6 md:grid-cols-[minmax(0,1fr)_240px]">
            <PlainVerdict s={s} v={v} assumption={assumption} />
            <figure className="entry self-start rounded-md border border-hair p-4 text-center">
              <Gauge value={s.scores?.overall} label={s.scores?.label ?? v?.label} family={v?.family} pending={!finished} />
              <figcaption className="mt-1 text-sm text-ink-soft">
                Health score out of 100{explainLabel(s.scores?.label ?? v?.label) ? `: ${explainLabel(s.scores?.label ?? v?.label)}` : ''}.
              </figcaption>
            </figure>
          </div>
        ) : (
          <section className="entry text-ink-soft">The court stopped before a verdict. See the earlier steps for what it found.</section>
        )}
        {s.dataChanged && <DataChanged sheets={s.dataChanged} />}
        <PlanSection plan={s.plan} pending={s.status === 'summarizing'} title={s.text} />
        <Review plan={s.plan} top={3} />
        {actions}
        {s.status === 'done' && sheetDocs.length > 0 && <SheetRefresh id={id} sheets={sheetDocs} />}
        {s.status === 'done' && !!s.documents?.length && <UpdateData id={id} docs={s.documents} />}
      </>
    ),
    plan: (
      <>
        <PlanSection plan={s.plan} pending={s.status === 'summarizing'} title={s.text} />
        <Review plan={s.plan} />
        {!s.plan && s.status !== 'summarizing' && <section className="entry text-ink-soft">No plan was made for this case.</section>}
      </>
    ),
    details: (
      <>
        {!simple && s.ghosts.length > 0 && (s.status === 'summarizing' || s.verdict || s.scores || s.plan || finished) && (
          <Suspense fallback={<div className="entry space-y-2" aria-label="Loading charts"><div className="skel w-full" /><div className="skel w-5/6" /></div>}>
            <Dashboard s={s} seconds={seconds} />
          </Suspense>
        )}
        {(s.report || s.status === 'summarizing') && (
          <section id="report" className="entry">
            <h2 className="sr-only">Full report</h2>
            {s.report ? (
              <Report md={s.report} streaming={s.status === 'summarizing'} family={v?.family} />
            ) : (
              <div className="space-y-2" aria-label="The Soul Binder is writing">
                <p className="text-ink-soft">The Soul Binder is writing…</p>
                <div className="skel w-full" /><div className="skel w-11/12" /><div className="skel w-3/4" />
              </div>
            )}
            {actions}
          </section>
        )}
      </>
    ),
    followup: (
      <>
        {finished && (s.text || s.report) ? <FollowUpBox id={id} family={v?.family} suggested={s.plan?.suggested_followups} />
          : <section className="entry text-ink-soft">You can ask a follow-up once the verdict is in.</section>}
        {s.status === 'done' && sheetDocs.length > 0 && <SheetRefresh id={id} sheets={sheetDocs} />}
        {s.status === 'done' && !!s.documents?.length && <UpdateData id={id} docs={s.documents} />}
        <p className="entry text-sm"><Link className="text-seal underline" to={isMock() ? '/?mock=1' : '/'}>Start a new case</Link></p>
      </>
    ),
  }

  return (
    <div>
      {conn === 'reconnecting' && (
        <p role="status" className="no-print mb-3 rounded-md border border-hair px-3 py-2 text-sm text-ink-soft">Lost connection. Reconnecting…</p>
      )}
      {conn === 'saved' && (
        <p role="status" className="no-print mb-3 rounded-md border border-hair px-3 py-2 text-sm text-ink-soft">
          Showing the saved copy from this browser. The server no longer has this case.
        </p>
      )}
      {interrupted && (
        <section role="alert" className="no-print mb-4 rounded-md border border-seal/50 bg-sheet px-4 py-3">
          <p className="font-serif text-lg">This run was interrupted (the server restarted). Everything up to that point is in the steps below.</p>
          {(s.text || s.url) && (
            <button className="btn btn-seal mt-2 text-sm" onClick={tryAgain} disabled={retrying}>{retrying ? 'Opening…' : 'Run it again'}</button>
          )}
        </section>
      )}
      {(s.error || s.status === 'error') && (
        <section className="no-print mb-4" role="alert">
          <div className="bar-seal">
            <h2 className="font-serif text-xl fam-stop">The court couldn't finish this case</h2>
            <p className="mt-1 text-sm text-ink-soft">{s.error || 'Something went wrong on the server.'}</p>
            <div className="mt-3 flex gap-2 text-sm">
              {(s.text || s.url) && (
                <button className="btn btn-seal" onClick={tryAgain} disabled={retrying}>{retrying ? 'Opening…' : 'Try again'}</button>
              )}
              <Link className="btn btn-line" to="/">Start a new case</Link>
            </div>
          </div>
        </section>
      )}
      <Thread items={meta.thread} search={search} />
      {ghostId && <TestimonyPanel s={s} ghostId={ghostId} base={base} search={search} />}

      <div ref={top} className="no-print mb-3 flex scroll-mt-4 flex-wrap items-center gap-2">
        {prev ? (
          <button type="button" className="btn btn-line !px-3 !py-1 text-sm" onClick={() => go(prev)}>← Back to {STEP_NAME[prev]}</button>
        ) : (
          <Link className="btn btn-line !px-3 !py-1 text-sm" to={isMock() ? '/?mock=1' : '/'}>← Back to home</Link>
        )}
        {pick && !finished && pick !== reached && (
          <button type="button" className="btn btn-seal !px-3 !py-1 text-sm" onClick={() => setPick(null)}>
            <span className="pulse-dot mr-1.5" aria-hidden /> Follow live
          </button>
        )}
        <span className="ml-auto hidden text-xs text-ink-soft sm:inline">Use ← → to move between steps</span>
      </div>
      {!finished && courtroom && <div className="live-stage no-print mb-4">{courtroom}</div>}
      <StepBar steps={steps} at={at} live={live} enabled={enabled} go={go} />

      <div className="sheet mt-2 min-w-0 overflow-hidden px-4 sm:px-8"
        onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }} onTouchEnd={onTouchEnd}>
        <div key={at} className={`step-pane ${dir}`}>
          <h2 className="sr-only">Step {atIdx + 1} of {steps.length}: {STEP_NAME[at]}</h2>
          {pane[at]}
          {atIdx < steps.length - 1 && enabled(steps[atIdx + 1]) && (
            <div className="no-print entry flex justify-end">
              <button type="button" className="btn btn-line" onClick={() => move(1)}>Next: {STEP_NAME[steps[atIdx + 1]]} →</button>
            </div>
          )}
        </div>
        <footer className="entry flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
          {seconds != null && <span>Finished in {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>}
          {!!calls && <span>{calls} model calls</span>}
          {!!tokens && <span>{tokens.toLocaleString()} tokens</span>}
          <span>Status: {s.status.replace('_', ' ')}</span>
        </footer>
      </div>
    </div>
  )
}

function StartupInfo({ d }: { d: Record<string, unknown> }) {
  const snap = (d.latest_snapshot ?? {}) as Record<string, string>
  const hn = (d.hn_discussions ?? []) as { title?: string; hn_url?: string }[]
  return (
    <div className="mt-1 space-y-1">
      {snap.title && <p className="font-medium">{snap.title}</p>}
      {snap.description && <p className="text-ink-soft">{snap.description}</p>}
      {snap.snapshot_url && <a className="text-seal underline" href={snap.snapshot_url} target="_blank" rel="noreferrer">Archived snapshot ↗</a>}
      {hn.length > 0 && (
        <ul className="text-sm">
          {hn.slice(0, 5).map((h, i) => (
            <li key={i}><a className="underline" href={h.hn_url} target="_blank" rel="noreferrer">{h.title || h.hn_url}</a></li>
          ))}
        </ul>
      )}
    </div>
  )
}
