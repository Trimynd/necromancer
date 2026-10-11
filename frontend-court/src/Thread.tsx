// Conversation pieces of a case page: the thread of earlier cases, the live step list, and the follow-up composer.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { followUp, isMock, loadRecent, parseVerdict, rootOf, saveRecent, sumSources, type CaseState, type ThreadItem } from './lib'

/** "You asked … → Soul Binder ruled PIVOT" for each earlier case in this thread (oldest first). */
export function Thread({ items, search }: { items: ThreadItem[]; search: string }) {
  if (!items.length) return null
  return (
    <nav aria-label="Conversation so far" className="no-print mb-4">
      <ol className="flex flex-col gap-1.5 text-sm">
        {items.map((t) => {
          const v = parseVerdict(t.verdict ?? undefined)
          const label = v?.label ?? t.verdict?.replace(/[*#]/g, '').trim().slice(0, 40)
          return (
            <li key={t.session_id}>
              <Link to={`/case/${t.session_id}${search}`} className="chip inline-flex max-w-full flex-wrap items-center gap-x-1.5 !px-2.5 !py-1 hover:border-seal">
                <span className="text-ink-soft">You asked</span>
                <span className="max-w-[40ch] truncate font-medium">“{t.question || 'Earlier question'}”</span>
                <span aria-hidden className="text-ink-soft">→</span>
                {label ? (
                  <span className={`fam-${v?.family ?? 'caution'}`}>Soul Binder ruled {label}</span>
                ) : (
                  <span className="text-ink-soft">{t.status === 'error' || t.status === 'interrupted' ? 'interrupted' : t.status === 'done' ? 'answered' : 'in progress'}</span>
                )}
              </Link>
            </li>
          )
        })}
        <li className="pl-2 text-xs text-ink-soft">↓ now</li>
      </ol>
    </nav>
  )
}

const ORDER = ['pending', 'routing', 'scraping', 'researching', 'role_making', 'in_court', 'summarizing', 'done']

/** Something useful within a second: elapsed time, the step we're on, and the router's searches as they arrive. */
export function LiveSteps({ s, since }: { s: CaseState; since: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const at = ORDER.indexOf(s.status)
  const simple = s.route?.complexity === 'simple'
  const qs = s.route?.search_queries ?? []
  const steps: [string, boolean][] = [
    [s.route ? `Read as: ${s.route.topic.replace(/_/g, ' ')}` : 'Reading your situation…', !!s.route || at > 1],
    ...(s.url ? [[s.startup ? 'Read the website' : 'Reading the website…', !!s.startup || at > 2] as [string, boolean]] : []),
    [
      s.research
        ? `Searched: ${sumSources(s.research)} sources from ${s.research.length} searches`
        : `Searching${qs.length ? ` ${qs.length} queries across` : ''} web, news and Reddit…`,
      !!s.research || at > 3,
    ],
    ...(simple
      ? []
      : ([
          [s.ghosts.length ? `Summoned ${s.ghosts.length} ghosts` : 'Summoning the council…', s.ghosts.length > 0],
          ['The ghosts testify; the Soul Binder rules', at > 5],
        ] as [string, boolean][])),
    [simple ? 'Writing the answer…' : 'Writing the verdict…', at > 6],
  ]
  const now = steps.findIndex(([, done]) => !done)
  const sec = Math.max(0, Math.round((Date.now() - since) / 1000))
  return (
    <div className="no-print mt-3 text-sm" aria-live="polite">
      <p className="text-ink-soft">Elapsed {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</p>
      <ol className="mt-1 space-y-0.5">
        {steps.map(([label, done], i) => (
          <li key={i} className={now >= 0 && i > now ? 'text-ink-soft' : ''}>
            <span aria-hidden className={`mr-1.5 ${done ? 'fam-go' : i === now ? 'text-seal' : ''}`}>{done ? '✓' : i === now ? '●' : '○'}</span>
            {label}
          </li>
        ))}
      </ol>
      {qs.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Search queries">
          {qs.map((q) => <li key={q} className="chip appear max-w-full truncate !px-2 !py-0.5 text-xs">🔍 {q}</li>)}
        </ul>
      )}
    </div>
  )
}

/** Ask a follow-up: a new case that continues this one (the backend briefs its council on this verdict). */
export function FollowUpBox({ id, family }: { id: string; family?: string }) {
  const nav = useNavigate()
  const old = loadRecent().find((r) => r.id === id)
  const [q, setQ] = useState('')
  const [depth, setDepth] = useState<'fast' | 'deep'>(old?.depth === 'deep' ? 'deep' : 'fast')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ideas = [
    family === 'go' ? 'What could still kill this?' : 'What would it take to make this a GO?',
    'Compare the top 2 competitors in detail',
    'Give me a 90-day plan',
  ]
  const t = q.trim()
  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (t.length < 3 || busy) return
    setBusy(true)
    setErr('')
    try {
      const newId = await followUp(id, { question: t, depth, strict: old?.strict, stage: old?.stage })
      saveRecent({ id: newId, title: t.slice(0, 80), text: t, depth, at: Date.now(), strict: old?.strict, stage: old?.stage, parent: id, root: rootOf(id) })
      nav(`/case/${newId}${isMock() ? '?mock=1' : ''}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <section id="followup" className="entry no-print">
      <form onSubmit={send} className="space-y-2">
        <h2 className="font-serif text-xl"><label htmlFor="followup-q">Ask a follow-up</label></h2>
        <div className="flex flex-wrap gap-1.5">
          {ideas.map((x) => (
            <button key={x} type="button" className="chip !px-2.5 !py-1 text-sm hover:border-seal" onClick={() => setQ(x)}>{x}</button>
          ))}
        </div>
        <textarea
          id="followup-q"
          className="field min-h-20 [field-sizing:content]"
          placeholder="The council remembers this verdict. What do you want to know next?"
          value={q}
          maxLength={4000}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <fieldset className="flex items-center gap-2 text-sm">
            <legend className="sr-only">Depth</legend>
            {(['fast', 'deep'] as const).map((d) => (
              <label key={d} className={`btn btn-line cursor-pointer !px-3 !py-1 ${depth === d ? 'border-seal! text-seal' : ''}`}>
                <input type="radio" name="followup-depth" value={d} checked={depth === d} onChange={() => setDepth(d)} className="sr-only" />
                {d === 'fast' ? 'Fast' : 'Deep'}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="btn btn-seal" disabled={t.length < 3 || busy}>{busy ? 'Opening…' : 'Send'}</button>
        </div>
        {err && <p role="alert" className="fam-stop text-sm">{err}</p>}
      </form>
    </section>
  )
}
