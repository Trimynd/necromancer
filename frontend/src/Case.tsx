import { useEffect, useReducer, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Courtroom } from './Courtroom'
import {
  fromSnapshot, initialState, isMock, loadRecent, parseVerdict, patchRecent, reduce, saveRecent, startCase, sumSources,
  type CaseState, type Ghost, type Case as GhostCase,
} from './lib'
import { MOCK_TEXT, playMock } from './mock'

const EVENTS = [
  'status', 'route', 'research', 'startup_data', 'manifest', 'pre_research', 'tool_call', 'agent_output', 'ghost_retry',
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

const confWord = (c?: number) => (c == null ? '' : c >= 0.75 ? 'confident' : c >= 0.5 ? 'fairly sure' : 'unsure')
const isUrl = (x?: string) => !!x && /^https?:\/\//.test(x)
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

function Claim({ c }: { c: GhostCase }) {
  return (
    <>
      <blockquote className="font-serif text-[20px] leading-snug">“{c.claim || '(no claim given)'}”</blockquote>
      {c.evidence.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[15px]">
          {c.evidence.map((e, i) => (
            <li key={i} className={`flex flex-wrap items-baseline gap-x-2 ${!e.source ? 'text-ink-soft' : ''}`}>
              <span>• {e.fact}</span>
              {e.source_type && <span className="chip text-ink-soft">{e.source_type}</span>}
              {isUrl(e.source) ? (
                <a href={e.source} target="_blank" rel="noreferrer" className="text-sm text-seal underline underline-offset-2">
                  {host(e.source!)} ↗
                </a>
              ) : e.source ? <span className="text-sm text-ink-soft">{e.source}</span> : <span className="text-xs italic">unsourced</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Testimony({ g }: { g: Ghost }) {
  const cur = g.cases[g.cases.length - 1]
  const old = g.cases.slice(0, -1)
  return (
    <article id={`ghost-${g.id}`} className={`bar-ghost py-4 ${g.phase === 'dropped' ? 'opacity-50' : ''}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{g.name}</h3>
        {cur && (
          <span className="text-sm text-ink-soft" title={cur.confidence != null ? `confidence ${cur.confidence}` : undefined}>
            {[cur.emotion, confWord(cur.confidence) && `${confWord(cur.confidence)} · ${Math.round((cur.confidence ?? 0) * 100)}%`].filter(Boolean).join(' · ')}
          </span>
        )}
      </header>
      {g.phase === 'dropped' ? (
        <p className="mt-1 text-sm text-ink-soft">Left the court: couldn't produce a case.{g.dropped && ` (${g.dropped})`}</p>
      ) : !cur || g.phase === 'redoing' || (g.phase === 'researching' && g.cases.length) ? (
        <p className="mt-1 text-sm text-ink-soft">
          {g.cases.length ? 'Redoing the case' : 'Is investigating'}…{g.query && <> Searching: <em>{g.query}</em></>}
        </p>
      ) : null}
      {old.map((c, i) => (
        <details key={i} className="mt-2 text-ink-soft">
          <summary className="cursor-pointer text-sm">{i === 0 ? 'First answer' : `Answer ${i + 1}`} (sent back)</summary>
          <div className="mt-2 line-through decoration-1 opacity-70"><Claim c={c} /></div>
        </details>
      ))}
      {cur && <div className="mt-2"><Claim c={cur} /></div>}
      {g.searches.length > 0 && (
        <p className="mt-2 text-xs text-ink-soft">Checked: {g.searches.map((q) => `“${q}”`).join(', ')}</p>
      )}
      {g.rulings.map(({ attempt, ruling: r }) => (
        <div key={attempt} className="bar-seal mt-3 text-sm">
          <span
            className={`chip mr-2 font-medium ${r.decision === 'accept' ? 'fam-go' : 'fam-stop'}`}
            style={{ borderColor: r.decision === 'accept' ? 'var(--go)' : 'var(--seal)' }}
          >
            {r.decision === 'accept' ? 'Accepted' : 'Sent back'}
          </span>
          <span className="text-ink-soft">Round {attempt + 1}{r.search_quality != null && ` · search quality ${Math.round(r.search_quality * 100)}%`}</span>
          {r.reason && <p className="mt-1">{r.reason}</p>}
          {r.decision === 'retry' && r.guidance && <p className="mt-1 font-serif italic">Soul Binder: “{r.guidance}”</p>}
          {r.decision === 'retry' && !!r.needs_more && typeof r.needs_more !== 'boolean' && (
            <p className="mt-1 text-ink-soft">Needs more: {Array.isArray(r.needs_more) ? r.needs_more.join(', ') : String(r.needs_more)}</p>
          )}
          {!!r.missing_sources?.length && <p className="text-ink-soft">Missing sources: {r.missing_sources.join(', ')}</p>}
        </div>
      ))}
    </article>
  )
}

const Md = ({ children }: { children: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
    {children}
  </ReactMarkdown>
)

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
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { s, conn } = useCaseStream(id)
  const [retrying, setRetrying] = useState(false)
  const simple = s.route?.complexity === 'simple'
  const finished = s.status === 'done' || s.status === 'error'
  const v = parseVerdict(s.verdict)

  useEffect(() => { document.title = s.text ? `${s.text.slice(0, 40)}… · Necromancer` : 'Case · Necromancer' }, [s.text])
  useEffect(() => { if (v?.label && !simple) patchRecent(id, { verdict: v.label }) }, [id, v?.label, simple])

  const tryAgain = async () => {
    setRetrying(true)
    try {
      const depth = loadRecent().find((r) => r.id === id)?.depth ?? 'fast'
      const newId = await startCase({ text: s.text, url: s.text ? undefined : s.url, depth })
      saveRecent({ id: newId, title: (s.text || s.url || 'Case').slice(0, 80), text: s.text, url: s.url, depth, at: Date.now() })
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
      {showStage && <Courtroom s={s} />}

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
                        {r.per_source && ' · ' + Object.entries(r.per_source).map(([k, n]) => `${k} ${n}`).join(', ')}
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
                <div className="mt-2 divide-y divide-hair">{s.ghosts.map((g) => <Testimony key={g.id} g={g} />)}</div>
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

          {!simple && (s.report || s.status === 'summarizing') && (
            <section id="report" className="entry">
              <div className={`md ${s.status === 'summarizing' ? 'caret' : ''}`}>
                {s.report ? <Md>{s.report}</Md> : <p className="text-ink-soft">The Soul Binder is writing…</p>}
              </div>
              {s.status === 'done' && (
                <div className="no-print mt-6 flex flex-wrap gap-2 text-sm">
                  <button className="btn btn-line" onClick={() => navigator.clipboard?.writeText(location.href)}>Copy link</button>
                  <button className="btn btn-line" onClick={() => print()}>Print / save as PDF</button>
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
