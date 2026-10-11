import { useEffect, useReducer, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Courtroom } from './Courtroom'
import { Dashboard, Md, Report } from './Dashboard'
import { TestimonyCard, TestimonyPanel } from './Ghost'
import {
  DOC_ICON, fromSnapshot, initialState, isMock, loadRecent, parseVerdict, patchRecent, reduce, saveRecent, startCase, sumSources,
  type CaseState,
} from './lib'
import { MOCK_TEXT, playMock } from './mock'

const EVENTS = [
  'status', 'documents', 'scores', 'route', 'research', 'startup_data', 'manifest', 'pre_research', 'tool_call', 'agent_output', 'ghost_retry',
  'ghost_dropped', 'window', 'rulings', 'report_chunk', 'verdict', 'summary', 'usage', 'call_log', 'error',
]

type Action = { event: string; data: unknown } | { event: 'load'; data: CaseState }
const reducer = (s: CaseState, a: Action) => (a.event === 'load' ? (a.data as CaseState) : reduce(s, a.event, a.data))

/** Owns the connection: snapshot first; finished cases render straight away, live ones open the SSE stream. */
function useCaseStream(id: string) {
  const recent = loadRecent().find((r) => r.id === id)
  const [s, dispatch] = useReducer(reducer, { ...initialState, text: recent?.text, url: recent?.url })
  const [conn, setConn] = useState<'connecting' | 'live' | 'reconnecting' | 'closed' | 'missing'>('connecting')

  useEffect(() => {
    if (isMock() || id.startsWith('mock-')) {
      dispatch({ event: 'load', data: { ...initialState, text: recent?.text ?? MOCK_TEXT } })
      setConn('live')
      return playMock((event, data) => dispatch({ event, data }))
    }
    let es: EventSource | undefined
    let poll: ReturnType<typeof setInterval> | undefined
    let dead = false

    const snapshot = async () => {
      const res = await fetch(`/api/session/${id}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error(String(res.status))
      return res.json()
    }
    const pollUntilDone = () => {
      poll = setInterval(async () => {
        try {
          const snap = await snapshot()
          if (dead || !snap) return
          dispatch({ event: 'load', data: { ...fromSnapshot(snap), text: snap.problem_statement ?? recent?.text } })
          if (snap.status === 'done' || snap.status === 'error') { clearInterval(poll); setConn('closed') }
        } catch { /* keep polling */ }
      }, 3000)
    }
    const open = (retries: number) => {
      es = new EventSource(`/api/stream/${id}`)
      // The server replays the whole session on connect, so start from a clean slate each time.
      es.onopen = () => { dispatch({ event: 'reset', data: null }); setConn('live') }
      for (const name of EVENTS) {
        es.addEventListener(name, (e) => {
          let data: unknown = (e as MessageEvent).data
          try { data = JSON.parse(data as string) } catch { /* plain string */ }
          dispatch({ event: name, data })
          if (name === 'status' && (data === 'done' || data === 'error')) {
            es?.close()
            setConn('closed')
            // usage/call_log are emitted after the final status, once the stream has closed.
            setTimeout(() => snapshot().then((snap) => !dead && snap?.usage && dispatch({ event: 'usage', data: snap.usage })).catch(() => {}), 1500)
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

    snapshot()
      .then((snap) => {
        if (dead) return
        if (!snap) return setConn('missing')
        const text = snap.problem_statement ?? recent?.text
        if (snap.status === 'done' || snap.status === 'error') {
          dispatch({ event: 'load', data: { ...fromSnapshot(snap), text } })
          setConn('closed')
        } else {
          dispatch({ event: 'load', data: { ...initialState, text, url: snap.input_url ?? undefined } })
          open(3)
        }
      })
      .catch(() => !dead && open(3))

    return () => { dead = true; es?.close(); clearInterval(poll) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  return { s, conn }
}

const STEPS = ['Read', 'Research', 'Council', 'Testimony', 'Rulings', 'Verdict', 'Report'] as const
const ANCHOR: Record<(typeof STEPS)[number], string> = {
  Read: 'words', Research: 'research', Council: 'council', Testimony: 'testimony', Rulings: 'testimony', Verdict: 'verdict', Report: 'report',
}
function stepIndex(s: CaseState) {
  switch (s.status) {
    case 'pending': case 'routing': return 0
    case 'scraping': case 'researching': return 1
    case 'role_making': return 2
    case 'in_court': return s.attempt >= 0 ? 4 : 3
    case 'summarizing': return s.report ? 6 : 5
    case 'done': return 7
    default: return s.report ? 6 : s.attempt >= 0 ? 4 : s.ghosts.length ? 3 : s.research ? 2 : 0
  }
}

function Rail({ s, simple }: { s: CaseState; simple: boolean }) {
  const idx = stepIndex(s)
  const steps = simple ? (['Read', 'Research', 'Verdict'] as const) : STEPS
  const at = simple ? (idx >= 7 ? 3 : Math.min(idx, 2)) : idx
  return (
    <nav aria-label="Proceedings" className="no-print min-w-0 self-start lg:sticky lg:top-4">
      <h2 className="mb-2 hidden font-serif text-lg lg:block">Proceedings</h2>
      <ol className="flex gap-3 overflow-x-auto pb-1 text-sm [scrollbar-width:none] lg:flex-col lg:gap-1.5">
        {steps.map((name, i) => {
          const state = s.status === 'error' && i === at ? 'err' : i < at ? 'done' : i === at ? 'now' : 'todo'
          return (
            <li key={name} className="shrink-0">
              <a href={`#${ANCHOR[name]}`} className={`flex items-center gap-1.5 ${state === 'todo' ? 'text-ink-soft' : ''}`} aria-current={state === 'now' ? 'step' : undefined}>
                <span aria-hidden className={state === 'done' ? 'fam-go' : state === 'now' ? 'text-seal' : state === 'err' ? 'fam-stop' : ''}>
                  {state === 'done' ? '✓' : state === 'now' ? '●' : state === 'err' ? '✕' : '○'}
                </span>
                {name}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Elapsed({ running }: { running: boolean }) {
  const start = useRef(Date.now())
  const [, tick] = useState(0)
  const [end, setEnd] = useState<number>()
  const ran = useRef(false)
  if (running) ran.current = true
  useEffect(() => {
    if (!running) { setEnd((e) => e ?? Date.now()); return }
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  if (!ran.current) return null
  const sec = Math.round(((end ?? Date.now()) - start.current) / 1000)
  return <span>{running ? 'Elapsed' : 'Finished in'} {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</span>
}

export function CasePage() {
  const params = useParams()
  const id = params.id ?? ''
  const ghostId = params['*']?.match(/^ghost\/([^/]+)/)?.[1]
  const { search } = useLocation()
  const base = `/case/${id}`
  const nav = useNavigate()
  const { s, conn } = useCaseStream(id)
  const t0 = useRef(Date.now())
  const ranLive = useRef(false)
  const [t1, setT1] = useState<number>()
  const [retrying, setRetrying] = useState(false)
  const simple = s.route?.complexity === 'simple'
  const finished = s.status === 'done' || s.status === 'error'
  const v = parseVerdict(s.verdict)
  if (!finished && s.status !== 'pending') ranLive.current = true
  useEffect(() => { if (finished) setT1((t) => t ?? Date.now()) }, [finished])
  const seconds = ranLive.current ? Math.round(((t1 ?? Date.now()) - t0.current) / 1000) : undefined

  // Glide to the verdict once, when it arrives live (never on reduced motion or a revisited case).
  const scrolled = useRef(false)
  useEffect(() => {
    if (!s.verdict || scrolled.current || !ranLive.current || simple) return
    scrolled.current = true
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setTimeout(() => document.getElementById('verdict')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
  }, [s.verdict, simple])

  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([s.report], { type: 'text/markdown' }))
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
      const newId = await startCase({ text: s.text, url: s.text ? undefined : s.url, depth, document_ids: old?.document_ids, strict: old?.strict })
      saveRecent({ id: newId, title: (s.text || s.url || 'Case').slice(0, 80), text: s.text, url: s.url, depth, at: Date.now(), document_ids: old?.document_ids, strict: old?.strict })
      nav(`/case/${newId}${isMock() ? '?mock=1' : ''}`)
    } catch { setRetrying(false) }
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
  const showStage = !simple && !(finished && !s.ghosts.length)

  return (
    <div>
      {conn === 'reconnecting' && (
        <p role="status" className="no-print mb-3 rounded-md border border-hair px-3 py-2 text-sm text-ink-soft">Lost connection. Reconnecting…</p>
      )}
      {showStage && <Courtroom s={s} ghostHref={(gid) => `${base}/ghost/${gid}${search}`} />}
      {ghostId && <TestimonyPanel s={s} ghostId={ghostId} base={base} search={search} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
        <Rail s={s} simple={simple} />
        <div className="sheet min-w-0 px-4 sm:px-8">
          <section id="words" className="py-6">
            {s.text ? (
              <p className="max-w-[68ch] font-serif text-[20px] italic leading-snug">“{s.text}”</p>
            ) : (
              <p className="text-ink-soft">{conn === 'connecting' ? 'Opening the case…' : 'Case'}</p>
            )}
            {s.url && <p className="mt-1 text-sm text-ink-soft">Website: <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a></p>}
          </section>

          {!!s.documents?.length && (
            <section id="documents" className="entry">
              <h2 className="font-serif text-xl">Documents in evidence</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {s.documents.map((d) => (
                  <li key={d.id} className="chip chip-doc flex max-w-full items-center gap-1.5 !px-2.5 !py-1 text-sm" title={d.preview}>
                    <span aria-hidden>{DOC_ICON[d.kind] ?? '📄'}</span>
                    <span className="truncate">{d.name}</span>
                    <span className="shrink-0 opacity-75">{d.pages ? `${d.pages} pages` : d.chars ? `${Math.max(1, Math.round(d.chars / 1000))}k chars` : ''}</span>
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

          {s.research && (
            <section id="research" className="entry">
              <details open={!finished}>
                <summary className="cursor-pointer font-serif text-xl">
                  Research: {s.research.length} searches, {sumSources(s.research)} sources
                </summary>
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
              </details>
            </section>
          )}

          {simple && (s.verdict || s.report) && (
            <section id="verdict" className="entry">
              <h2 className="font-serif text-[28px]">The answer</h2>
              <p className="mb-2 text-sm text-ink-soft">This was a quick question, so no court was needed.</p>
              <div className="md bar-seal"><Md>{s.report || s.verdict || ''}</Md></div>
            </section>
          )}

          {s.ghosts.length > 0 && (
            <>
              <section id="council" className="entry">
                <h2 className="font-serif text-[28px]">The council assembled</h2>
                {s.problemSummary && <p className="mt-1 max-w-[68ch] font-serif text-[18px]">{s.problemSummary}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.ghosts.map((g, i) => (
                    <a key={g.id} href={`#ghost-${g.id}`} className="appear chip !px-2.5 !py-1 text-sm" style={{ animationDelay: `${i * 120}ms`, borderColor: 'var(--ghost)' }}>
                      {g.name}
                    </a>
                  ))}
                </div>
              </section>
              <section id="testimony" className="entry">
                <h2 className="font-serif text-[28px]">Testimony</h2>
                <div className="mt-2 divide-y divide-hair">
                  {s.ghosts.map((g) => <TestimonyCard key={g.id} g={g} href={`${base}/ghost/${g.id}${search}`} />)}
                </div>
              </section>
            </>
          )}

          {!simple && v && (
            <section id="verdict" className="entry">
              <div className="bar-seal flex items-start gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink-soft">The Soul Binder's verdict</p>
                  {v.label && (
                    <p className={`font-serif text-[32px] font-semibold leading-tight sm:text-[44px] fam-${v.family ?? 'caution'}`}>{v.label}</p>
                  )}
                  {v.confidence != null && <p className="text-sm text-ink-soft">Confidence {v.confidence}%</p>}
                </div>
              </div>
            </section>
          )}

          {!simple && s.ghosts.length > 0 && (s.status === 'summarizing' || s.verdict || s.scores || finished) && (
            <Dashboard s={s} seconds={seconds} />
          )}

          {!simple && (s.report || s.status === 'summarizing') && (
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
              {s.status === 'done' && (
                <div className="no-print mt-6 flex flex-wrap gap-2 text-sm">
                  <button className="btn btn-seal" onClick={download}>Download report (.md)</button>
                  <button className="btn btn-line" onClick={() => print()}>Print / PDF</button>
                  <button className="btn btn-line" onClick={() => navigator.clipboard?.writeText(location.href)}>Copy link</button>
                  <Link className="btn btn-line" to={isMock() ? '/?mock=1' : '/'}>Start a new case</Link>
                </div>
              )}
            </section>
          )}

          {(s.error || s.status === 'error') && (
            <section className="entry" role="alert">
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

          <footer className="entry flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            <Elapsed running={!finished} />
            {!!calls && <span>{calls} model calls</span>}
            {!!tokens && <span>{tokens.toLocaleString()} tokens</span>}
            <span>Status: {s.status.replace('_', ' ')}</span>
          </footer>
        </div>
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
