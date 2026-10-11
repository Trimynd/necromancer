import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DOC_ICON, initials, parseVerdict, roundOf, sumSources, verdictText, type CaseState, type Ghost } from './lib'
import { explainLabel } from './Plan'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// Scalloped wax-seal outline, computed once.
const SEAL_PATH = (() => {
  const n = 22, pts: string[] = []
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2
    const r = i % 2 ? 46 : 49
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
})()

function Seal({ busy, stamped }: { busy: boolean; stamped: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`seal ${busy ? 'busy' : ''} ${stamped ? 'stamp' : ''}`} aria-hidden>
      <path d={SEAL_PATH} fill="currentColor" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="rgb(255 255 255 / .35)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="rgb(255 255 255 / .2)" strokeWidth="1" />
      <text x="50" y="58" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontSize="24" fontWeight="600" fill="rgb(255 255 255 / .9)">
        SB
      </text>
    </svg>
  )
}

const PHASE_LABEL: Record<Ghost['phase'], string> = {
  spawned: 'Arriving',
  researching: 'Researching',
  thinking: 'Building a case',
  presented: 'Case presented',
  accepted: 'Accepted',
  redoing: 'Sent back, redoing',
  sent_back: 'Sent back',
  dropped: 'Left the court',
}

function GhostFigure({ g, i, refCb, href }: { g: Ghost; i: number; refCb: (el: HTMLDivElement | null) => void; href: string }) {
  const [open, setOpen] = useState(false)
  const last = g.cases[g.cases.length - 1]
  const ruling = g.rulings[g.rulings.length - 1]?.ruling
  const round = roundOf(g)
  const busy = g.phase === 'researching' || g.phase === 'thinking' || g.phase === 'redoing' || g.phase === 'spawned'
  return (
    <div
      className={`ghost ${g.phase}`}
      style={{ ['--d' as string]: `${i * 140}ms` }}
    >
      <div className="avatar-wrap" ref={refCb}>
        {(g.phase === 'researching' || g.phase === 'spawned') && <div className="orbit" aria-hidden><i /><i /></div>}
        <Link to={href} className="avatar font-serif" style={{ color: 'var(--ink)' }} aria-label={`Read the testimony of ${g.name}`}>{initials(g.name)}</Link>
        {g.phase === 'accepted' && <span className="badge" style={{ background: 'var(--go)' }} aria-label="Accepted">✓</span>}
        {(g.phase === 'redoing' || g.phase === 'sent_back') && (
          <button
            className="badge cursor-pointer"
            style={{ background: 'var(--stop)' }}
            aria-label="Sent back — show the Soul Binder's guidance"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
          >
            ↺
          </button>
        )}
        {open && ruling && (
          <div className="bubble" role="tooltip">
            <div className="fam-stop font-medium">Sent back</div>
            {ruling.guidance || ruling.reason}
          </div>
        )}
      </div>
      <Link to={href} className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight hover:underline">{g.name}</Link>
      <div className={`text-xs ${g.phase === 'accepted' ? 'fam-go' : g.phase === 'redoing' || g.phase === 'sent_back' ? 'fam-stop' : 'text-ink-soft'}`}>
        {PHASE_LABEL[g.phase]}
        {round > 1 && g.phase !== 'dropped' && ` · Round ${round}`}
      </div>
      {busy && g.query && (
        <div className="mx-auto mt-0.5 max-w-[150px] truncate text-[11px] text-ink-soft" title={g.query}>
          🔍 {g.query}
        </div>
      )}
      {g.phase === 'dropped' && g.dropped && (
        <div className="mx-auto max-w-[150px] truncate text-[11px] text-ink-soft" title={g.dropped}>{g.dropped}</div>
      )}
      {last && !busy && g.phase !== 'dropped' && (
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          {last.confidence != null && <span className="chip">{Math.round(last.confidence * 100)}%</span>}
          {last.emotion && <span className="chip text-ink-soft">{last.emotion}</span>}
        </div>
      )}
      {g.phase === 'accepted' && ruling?.search_quality != null && (
        <div className="mx-auto mt-1 h-1 w-16 overflow-hidden rounded bg-hair" title={`Search quality ${Math.round(ruling.search_quality * 100)}%`}>
          <div className="h-full" style={{ width: `${ruling.search_quality * 100}%`, background: 'var(--go)' }} />
        </div>
      )}
    </div>
  )
}

export function Courtroom({ s, ghostHref }: { s: CaseState; ghostHref: (id: string) => string }) {
  const stage = useRef<HTMLDivElement>(null)
  const seal = useRef<HTMLDivElement>(null)
  const ghostEls = useRef<Record<string, HTMLDivElement | null>>({})
  const seen = useRef<Record<string, { cases: number; rulings: number }>>({})
  const [beams, setBeams] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([])

  const centre = (el: Element) => {
    const r = el.getBoundingClientRect(), b = stage.current!.getBoundingClientRect()
    return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 }
  }

  // A case scroll flies ghost -> seal on agent_output, and seal -> ghost when sent back.
  const fly = (from: Element, to: Element, back: boolean) => {
    if (!stage.current || reducedMotion()) return
    const p = centre(from), q = centre(to)
    const el = document.createElement('div')
    el.className = `scroll-token${back ? ' back' : ''}`
    el.style.left = `${p.x - 11}px`
    el.style.top = `${p.y - 14}px`
    stage.current.appendChild(el)
    const dx = q.x - p.x, dy = q.y - p.y
    el.animate(
      [
        { transform: 'translate(0,0) scale(.5) rotate(0deg)', opacity: 0 },
        { transform: `translate(${dx * 0.1}px,${dy * 0.1 - 20}px) scale(1) rotate(-10deg)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${dx * 0.55}px,${dy * 0.55 - 45}px) scale(1) rotate(8deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px,${dy}px) scale(.6) rotate(0deg)`, opacity: 0.2 },
      ],
      { duration: 1300, easing: 'cubic-bezier(.45,0,.3,1)' },
    ).onfinish = () => el.remove()
  }

  useEffect(() => {
    for (const g of s.ghosts) {
      const prev = seen.current[g.id]
      const el = ghostEls.current[g.id]
      if (prev && el && seal.current) {
        if (g.cases.length > prev.cases) fly(el, seal.current, false)
        const r = g.rulings[g.rulings.length - 1]?.ruling
        if (g.rulings.length > prev.rulings && r?.decision === 'retry') setTimeout(() => el.isConnected && seal.current && fly(seal.current, el, true), 200)
      }
      seen.current[g.id] = { cases: g.cases.length, rulings: g.rulings.length }
    }
  }, [s.ghosts])

  const writing = s.status === 'summarizing'
  // Beams from accepted ghosts into the seal while the Soul Binder writes.
  useLayoutEffect(() => {
    const compute = () => {
      if (!writing || !seal.current || !stage.current) return setBeams([])
      const c = centre(seal.current)
      setBeams(
        s.ghosts
          .filter((g) => g.phase === 'accepted' || g.phase === 'sent_back')
          .map((g) => ghostEls.current[g.id])
          .filter((el): el is HTMLDivElement => !!el)
          .map((el) => {
            const p = centre(el)
            return { x1: p.x, y1: p.y, x2: c.x, y2: c.y }
          }),
      )
    }
    compute()
    if (!writing) return
    const ro = new ResizeObserver(compute)
    ro.observe(stage.current!)
    const t = setTimeout(compute, 700) // after the rise-in animation settles
    return () => { ro.disconnect(); clearTimeout(t) }
  }, [writing, s.ghosts])

  const v = parseVerdict(verdictText(s))
  const active = s.ghosts.filter((g) => g.phase !== 'dropped')
  const deliberating =
    s.status === 'in_court' && active.length > 0 && active.every((g) => g.phase === 'presented' || g.phase === 'accepted' || g.phase === 'sent_back') &&
    active.some((g) => g.phase === 'presented')

  const found = sumSources(s.research)
  const caption = (() => {
    if (s.status === 'error' || s.status === 'interrupted') return 'The court was interrupted.'
    if (v) return 'The Soul Binder has ruled.'
    if (writing) return 'The Soul Binder is writing the verdict…'
    if (deliberating) return 'The Soul Binder is weighing the cases…'
    if (s.ghosts.some((g) => g.phase === 'redoing' || (g.phase === 'researching' && g.cases.length)))
      return 'Sent-back ghosts are digging deeper…'
    if (s.ghosts.length && s.status === 'in_court') {
      const presented = s.ghosts.filter((g) => g.cases.length).length
      return presented ? `${presented} of ${s.ghosts.length} cases presented` : 'The ghosts are gathering evidence…'
    }
    if (s.ghosts.length) return 'The council has been summoned.'
    if (s.status === 'role_making') return `Summoning the council…${found ? ` (${found} sources on file)` : ''}`
    if (s.status === 'researching')
      return s.research ? `Searching the web… ${found} sources from ${s.research.length} searches` : 'Searching the web…'
    if (s.status === 'scraping') return 'Reading the old website…'
    return 'Reading your situation…'
  })()

  return (
    <section className="stage sheet mb-6" ref={stage} aria-label="The courtroom">
      <p className="stage-caption font-serif text-[18px] text-ink-soft" aria-live="polite">{caption}</p>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {beams.map((b, i) => <line key={i} className="beam" {...b} />)}
      </svg>
      <div className="ghost-grid">
        {s.ghosts.map((g, i) => (
          <GhostFigure key={g.id} g={g} i={i} href={ghostHref(g.id)} refCb={(el) => { ghostEls.current[g.id] = el }} />
        ))}
      </div>
      <div className="seal-wrap" ref={seal}>
        <Seal busy={(deliberating || writing || (!s.ghosts.length && s.status !== 'error' && s.status !== 'done' && s.status !== 'interrupted'))} stamped={!!v} />
        <div className="mt-1 text-sm font-medium" style={{ color: 'var(--seal)' }}>Soul Binder</div>
        {!!s.documents?.length && (
          <div className="bench-docs" aria-label={`${s.documents.length} documents in evidence`}>
            {s.documents.map((d) => <span key={d.id} title={d.name} className="appear">{DOC_ICON[d.kind] ?? '📄'}</span>)}
          </div>
        )}
        {v?.label && (
          <div className={`appear font-serif text-[22px] font-semibold leading-tight sm:text-[28px] fam-${v.family ?? 'caution'} max-w-[260px] text-center`}>
            {v.label}
            {explainLabel(v.label) && <span className="block font-sans text-sm font-normal text-ink">{explainLabel(v.label)}</span>}
            {v.confidence != null && <span className="block font-sans text-xs font-normal text-ink-soft">{v.confidence}% sure</span>}
          </div>
        )}
      </div>
    </section>
  )
}
