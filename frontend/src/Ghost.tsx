// Ghost testimony: compact cards for the case file and the full testimony panel (/case/:id/ghost/:ghostId).
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { initials, roundOf, splitHighlights, type Case as GhostCase, type CaseState, type Evidence, type Ghost } from './lib'

export const confWord = (c?: number) => (c == null ? '' : c >= 0.75 ? 'confident' : c >= 0.5 ? 'fairly sure' : 'unsure')
export const isUrl = (x?: string) => !!x && /^https?:\/\//.test(x)
export const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }
export const srcLabel = (t?: string) => (t === 'document' ? 'Your document' : t || 'other')

/** Numbers, ₹ amounts, percentages and dates get a ghost-coloured mark. */
export function Hl({ text }: { text: string }) {
  return <>{splitHighlights(text).map((p, i) => (i % 2 ? <mark key={i} className="hl">{p}</mark> : p))}</>
}

export function SourceTag({ type }: { type?: string }) {
  if (!type) return null
  return type === 'document'
    ? <span className="chip chip-doc">📄 Your document</span>
    : <span className="chip text-ink-soft">{type}</span>
}

function Source({ e }: { e: Evidence }) {
  if (isUrl(e.source))
    return <a href={e.source} target="_blank" rel="noreferrer" className="text-sm text-seal underline underline-offset-2">{host(e.source!)} ↗</a>
  if (e.source) return <span className="text-sm text-ink-soft">{e.source}</span>
  return <span className="text-xs italic text-ink-soft">unsourced</span>
}

export function EvidenceList({ items, prev, keyFact }: { items: Evidence[]; prev?: Evidence[]; keyFact?: string }) {
  const before = new Set(prev?.map((e) => e.fact))
  const now = new Set(items.map((e) => e.fact))
  const removed = prev?.filter((e) => !now.has(e.fact)) ?? []
  if (!items.length && !removed.length) return <p className="text-sm italic text-ink-soft">No evidence given.</p>
  return (
    <ul className="space-y-2 text-[15px]">
      {items.map((e, i) => (
        <li key={i} className={`ev ${!e.source ? 'text-ink-soft' : ''}`}>
          <span><Hl text={e.fact} /></span>{' '}
          <span className="inline-flex flex-wrap items-baseline gap-1.5 align-baseline">
            {prev && !before.has(e.fact) && <span className="chip chip-new">new</span>}
            {keyFact === e.fact && <span className="chip chip-key">★ key evidence</span>}
            <SourceTag type={e.source_type} />
            <Source e={e} />
          </span>
        </li>
      ))}
      {removed.map((e, i) => (
        <li key={'r' + i} className="ev text-ink-soft line-through decoration-1 opacity-70" aria-label={`Dropped: ${e.fact}`}>{e.fact}</li>
      ))}
    </ul>
  )
}

/** The strongest evidence: the first sourced item of an accepted case, preferring documents, finance and news. */
// ponytail: source-type heuristic, swap for a backend "weight" field if the Soul Binder ever scores items.
export function keyEvidence(g: Ghost): string | undefined {
  if (g.phase !== 'accepted') return
  const ev = g.cases[g.cases.length - 1]?.evidence.filter((e) => e.source) ?? []
  const rank = (t?: string) => ['document', 'finance', 'news'].indexOf(t ?? '') + 1 || 9
  return [...ev].sort((a, b) => rank(a.source_type) - rank(b.source_type))[0]?.fact
}

export function Stamp({ g }: { g: Ghost }) {
  const r = g.rulings[g.rulings.length - 1]?.ruling
  const n = roundOf(g)
  if (g.phase === 'dropped') return <span className="stamp-chip text-ink-soft">Left the court</span>
  if (g.phase === 'accepted') return <span className="stamp-chip fam-go" style={{ borderColor: 'var(--go)' }}>Accepted ✓{n > 1 && ` (Round ${n})`}</span>
  if (r?.decision === 'retry')
    return <span className="stamp-chip fam-stop" style={{ borderColor: 'var(--seal)' }}>Sent back ↺ (Round {n - 1}){g.phase !== 'sent_back' && ` · redoing`}</span>
  if (g.cases.length) return <span className="stamp-chip text-ink-soft">Awaiting ruling</span>
  return <span className="stamp-chip text-ink-soft">Investigating…</span>
}

const countByType = (c?: GhostCase) =>
  Object.entries((c?.evidence ?? []).reduce<Record<string, number>>((m, e) => ((m[srcLabel(e.source_type)] = (m[srcLabel(e.source_type)] ?? 0) + 1), m), {}))

export function TestimonyCard({ g, href }: { g: Ghost; href: string }) {
  const cur = g.cases[g.cases.length - 1]
  const busy = !cur || g.phase === 'redoing' || (g.phase === 'researching' && g.cases.length > 0) || g.phase === 'thinking'
  return (
    <article id={`ghost-${g.id}`} className={`bar-ghost py-4 ${g.phase === 'dropped' ? 'opacity-50' : ''}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{g.name}</h3>
        <Stamp g={g} />
      </header>
      {cur ? (
        <p className="mt-1.5 line-clamp-2 font-serif text-[18px] leading-snug">“<Hl text={cur.claim || '(no claim given)'} />”</p>
      ) : g.phase !== 'dropped' ? (
        <div className="mt-2 space-y-1.5" aria-hidden><div className="skel w-11/12" /><div className="skel w-2/3" /></div>
      ) : null}
      {busy && g.query && g.phase !== 'dropped' && (
        <p className="mt-1 text-sm text-ink-soft">{g.cases.length ? 'Redoing the case.' : 'Investigating.'} Searching: <em>{g.query}</em></p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
        {cur?.confidence != null && <span title={`confidence ${cur.confidence}`}>{confWord(cur.confidence)} · {Math.round(cur.confidence * 100)}%</span>}
        {countByType(cur).map(([t, n]) => (
          <span key={t} className={`chip ${t === 'Your document' ? 'chip-doc' : ''}`}>{t} {n}</span>
        ))}
        {(cur || g.searches.length > 0) && <Link to={href} className="ml-auto font-medium text-seal underline underline-offset-2">Read full testimony →</Link>}
      </div>
    </article>
  )
}

function ConfidenceRing({ value }: { value?: number }) {
  const pct = Math.round((value ?? 0) * 100)
  return (
    <svg viewBox="0 0 44 44" className="h-14 w-14 shrink-0" role="img" aria-label={value == null ? 'No confidence given' : `Confidence ${pct}%`}>
      <circle cx="22" cy="22" r="18" fill="none" stroke="var(--hair)" strokeWidth="4" />
      {value != null && (
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--ghost)" strokeWidth="4" strokeLinecap="round"
          pathLength={100} strokeDasharray={`${pct} 100`} transform="rotate(-90 22 22)" />
      )}
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)">{value == null ? '–' : `${pct}%`}</text>
    </svg>
  )
}

export function TestimonyPanel({ s, ghostId, base, search }: { s: CaseState; ghostId: string; base: string; search: string }) {
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const i = s.ghosts.findIndex((g) => g.id === ghostId)
  const g = s.ghosts[i]
  const close = () => nav(base + search)

  useEffect(() => { ref.current?.focus() }, [ghostId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  const prev = s.ghosts[i - 1], next = s.ghosts[i + 1]
  const href = (x: Ghost) => `${base}/ghost/${x.id}${search}`
  const cur = g?.cases[g.cases.length - 1]
  const keyFact = g && keyEvidence(g)
  const unknowns = [...new Set(g?.cases.flatMap((c) => c.search_log?.unknowns ?? []) ?? [])]
  const rounds = g ? Math.max(g.cases.length, g.roundSearches?.length ?? 0, 1) : 0

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end bg-black/40" onClick={close}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ghost-title"
        className="panel h-full w-full max-w-[760px] overflow-y-auto bg-paper outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-hair bg-paper px-4 py-2 text-sm sm:px-6">
          <div className="flex gap-2">
            <button className="btn btn-line !px-2.5 !py-1" onClick={close}>← Back to case</button>
            {prev ? <Link to={href(prev)} className="btn btn-line !px-2.5 !py-1" aria-label={`Previous: ${prev.name}`}>← Prev</Link> : <span className="btn btn-line !px-2.5 !py-1 opacity-40" aria-hidden>← Prev</span>}
            {next ? <Link to={href(next)} className="btn btn-line !px-2.5 !py-1" aria-label={`Next: ${next.name}`}>Next →</Link> : <span className="btn btn-line !px-2.5 !py-1 opacity-40" aria-hidden>Next →</span>}
          </div>
          {g && <span className="hidden text-ink-soft sm:inline">Testimony {i + 1} of {s.ghosts.length}</span>}
          <button className="btn btn-line !px-2.5 !py-1" onClick={close} aria-label="Close testimony">✕ Close</button>
        </div>

        {!g ? (
          <p className="p-6 text-ink-soft">{s.ghosts.length ? 'No ghost by that name in this case.' : 'The council is still being summoned…'}</p>
        ) : (
          <div className="sheet m-0 px-4 py-6 sm:px-8">
            <header className="flex items-start gap-4">
              <div className="avatar !h-14 !w-14 shrink-0 font-serif !animate-none" aria-hidden>{initials(g.name)}</div>
              <div className="min-w-0 flex-1">
                <h2 id="ghost-title" className="font-serif text-[28px] leading-tight">{g.name}</h2>
                {g.persona && <p className="mt-1 text-sm text-ink-soft">{g.persona.length > 260 ? g.persona.slice(0, 257) + '…' : g.persona}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Stamp g={g} />
                  {cur?.emotion && <span className="chip text-ink-soft">{cur.emotion}</span>}
                  {cur?.confidence != null && <span className="text-ink-soft">{confWord(cur.confidence)}</span>}
                </div>
              </div>
              <ConfidenceRing value={cur?.confidence} />
            </header>

            {g.phase === 'dropped' && <p className="mt-4 text-ink-soft">Left the court: couldn't produce a case.{g.dropped && ` (${g.dropped})`}</p>}

            {cur ? (
              <blockquote className="pull mt-6 font-serif text-[24px] leading-snug sm:text-[28px]">“<Hl text={cur.claim || '(no claim given)'} />”</blockquote>
            ) : g.phase !== 'dropped' && (
              <div className="mt-6 space-y-2" aria-label="Waiting for this ghost's case"><div className="skel h-5 w-full" /><div className="skel h-5 w-3/4" /></div>
            )}

            {cur && (
              <section className="mt-6">
                <h3 className="font-serif text-xl">Evidence {g.cases.length > 1 && <span className="text-sm font-normal text-ink-soft">(final answer)</span>}</h3>
                <div className="mt-2"><EvidenceList items={cur.evidence} keyFact={keyFact} /></div>
              </section>
            )}

            {unknowns.length > 0 && (
              <section className="mt-6">
                <h3 className="font-serif text-xl">Still unknown</h3>
                <ul className="mt-1 list-disc pl-5 text-[15px] text-ink-soft">{unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
              </section>
            )}

            <section className="mt-8">
              <h3 className="font-serif text-xl">How the case was built</h3>
              <ol className="timeline mt-3">
                {Array.from({ length: rounds }, (_, r) => {
                  const c = g.cases[r]
                  const ruling = g.rulings[r]?.ruling
                  const qs = g.roundSearches?.[r] ?? (r === 0 ? (g.searches.length ? g.searches : c?.search_log?.queries ?? []) : [])
                  return (
                    <li key={r} className="pb-6">
                      <p className="font-medium">Round {r + 1}</p>
                      {qs.length > 0 && (
                        <div className="mt-1 text-sm">
                          <span className="text-ink-soft">{r ? 'Re-researched:' : 'Researched:'}</span>
                          <ul className="mt-1 flex flex-wrap gap-1.5">{qs.map((q, k) => <li key={k} className="chip !px-2">🔍 {q}</li>)}</ul>
                        </div>
                      )}
                      {c ? (
                        <div className="bar-ghost mt-2">
                          {r > 0 && g.cases[r - 1] && g.cases[r - 1].claim !== c.claim && (
                            <p className="font-serif text-[16px] text-ink-soft line-through decoration-1 opacity-70">“{g.cases[r - 1].claim}”</p>
                          )}
                          <p className="font-serif text-[18px] leading-snug">“<Hl text={c.claim || '(no claim given)'} />”</p>
                          <p className="mt-1 text-xs text-ink-soft">
                            {[c.emotion, c.confidence != null && `confidence ${Math.round(c.confidence * 100)}%`, `${c.evidence.length} evidence`].filter(Boolean).join(' · ')}
                          </p>
                          <details className="mt-1" open={r > 0}>
                            <summary className="cursor-pointer text-sm text-ink-soft">{r > 0 ? 'What changed in the evidence' : 'Evidence presented'}</summary>
                            <div className="mt-2"><EvidenceList items={c.evidence} prev={r > 0 ? g.cases[r - 1]?.evidence : undefined} /></div>
                          </details>
                        </div>
                      ) : g.phase !== 'dropped' && <p className="mt-2 text-sm text-ink-soft">Building the case…</p>}
                      {ruling ? (
                        <div className="bar-seal mt-3 text-sm">
                          <span className={`stamp-chip ${ruling.decision === 'accept' ? 'fam-go' : 'fam-stop'}`} style={{ borderColor: ruling.decision === 'accept' ? 'var(--go)' : 'var(--seal)' }}>
                            {ruling.decision === 'accept' ? 'Accepted ✓' : 'Sent back ↺'}
                          </span>
                          {ruling.reason && <p className="mt-1.5">{ruling.reason}</p>}
                          {ruling.search_quality != null && (
                            <div className="mt-2 flex items-center gap-2 text-ink-soft">
                              <span>Search quality</span>
                              <span className="h-1.5 w-28 overflow-hidden rounded bg-hair" aria-hidden>
                                <span className="block h-full" style={{ width: `${ruling.search_quality * 100}%`, background: 'var(--seal)' }} />
                              </span>
                              <span>{Math.round(ruling.search_quality * 100)}%</span>
                            </div>
                          )}
                          {!!ruling.needs_more && typeof ruling.needs_more !== 'boolean' && (
                            <p className="mt-1 text-ink-soft">Needs more: {Array.isArray(ruling.needs_more) ? ruling.needs_more.join(', ') : String(ruling.needs_more)}</p>
                          )}
                          {!!ruling.missing_sources?.length && <p className="mt-1 text-ink-soft">Missing sources: {ruling.missing_sources.join(', ')}</p>}
                          {ruling.decision === 'retry' && ruling.guidance && (
                            <blockquote className="guidance mt-2 font-serif italic">“{ruling.guidance}”<footer className="mt-0.5 font-sans text-xs not-italic text-ink-soft">— the Soul Binder</footer></blockquote>
                          )}
                        </div>
                      ) : c && <p className="mt-2 text-sm text-ink-soft">Waiting for the Soul Binder…</p>}
                    </li>
                  )
                })}
              </ol>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
