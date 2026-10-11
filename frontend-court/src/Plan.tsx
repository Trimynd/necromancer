// Plain-language verdict, the 90-day plan (Gantt as a CSS grid) and the detailed review. No recharts: renders instantly.
import { useState, type ReactNode } from 'react'
import { Md } from './Report'
import { planCsv, type CaseState, type Family, type Plan, type PlanTask } from './lib'

// ---- glossary: one place for every bit of jargon on the page ----
export const GLOSSARY: Record<string, string> = {
  sure: 'How confident the council is in its answer. 80% or more means very sure; under 50% means treat it as a guess.',
  health: 'One number from 0 to 100 for how healthy the idea or business looks. 70+ is good, 40–69 needs changes, under 40 is risky.',
  research: 'How well an expert backed up what they said with real sources. Low means they mostly guessed.',
  label: 'The short verdict stamp. GO = go ahead, PIVOT = change the plan then go, NO-GO = don’t do it this way.',
  'Market demand': 'Do enough people want this and will pay for it?',
  Competition: 'How many others already sell something similar, and how easy it is for buyers to switch.',
  'Unit economics': 'Do you make money on each sale after paying for the food, delivery, packing and so on?',
  'Regulation & risk': 'Licences, rules and other things outside your control that could stop you.',
  Execution: 'How hard it is for you to actually run this well, day after day.',
  council: 'A small panel of AI “experts”, each looking at your case from one side (a customer, an operator, an investor…).',
}

/** A word with a small “?” that opens a plain explanation. */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const text = GLOSSARY[k]
  if (!text) return <>{children ?? k}</>
  return (
    <span className="term">
      {children ?? k}
      <button type="button" className="term-q no-print" aria-expanded={open} aria-label={`What does “${typeof children === 'string' ? children : k}” mean?`}
        onClick={() => setOpen((o) => !o)}>?</button>
      {open && <span role="note" className="term-tip">{text}</span>}
    </span>
  )
}

const LABELS: [RegExp, string][] = [
  [/^no[\s-]?go/i, 'Don’t do it this way'],
  [/^pivot/i, 'Change the plan, then go'],
  [/^go\b/i, 'Go ahead'],
  [/^(scale|grow|expand)/i, 'Yes, grow it'],
  [/^(hold|wait|not yet)/i, 'Wait, don’t grow yet'],
  [/^(rescue|fix|turnaround|recoverable|save)/i, 'It can be saved, fix it first'],
  [/^(shut|close|wind)/i, 'Close it down'],
  [/^(revive|relaunch|resurrect)/i, 'Bring it back'],
  [/^(let it rest|stay dead|rest in peace|bury)/i, 'Leave it closed'],
]
export const explainLabel = (label?: string) => (label ? LABELS.find(([re]) => re.test(label.trim()))?.[1] : undefined)

const sureWords = (c: number) => (c >= 80 ? 'Very sure' : c >= 60 ? 'Fairly sure' : c >= 40 ? 'Not very sure' : 'Unsure')

const Skel = ({ n = 3 }: { n?: number }) => (
  <div className="space-y-2 py-2" aria-label="Loading">{Array.from({ length: n }, (_, i) => <div key={i} className="skel" style={{ width: `${100 - i * 12}%` }} />)}</div>
)

export function PlainVerdict({ s, v, assumption }: {
  s: CaseState; v: { label?: string; family?: Family; confidence?: number; body: string } | null; assumption?: string
}) {
  const p = s.scores?.plain
  const label = v?.label ?? s.scores?.label
  const fam = v?.family ?? 'caution'
  const easy = explainLabel(label)
  const conf = v?.confidence
  return (
    <section id="verdict" className="entry">
      <div className="bar-seal" style={{ borderColor: `var(--${fam})` }}>
        <p className="text-sm text-ink-soft">The answer</p>
        {p?.verdict_in_plain_words ? (
          <p className="mt-1 max-w-[40ch] font-serif text-[26px] font-semibold leading-snug sm:text-[32px]">{p.verdict_in_plain_words}</p>
        ) : !label ? <Skel n={2} /> : null}
        {label && (
          <p className={`mt-2 flex flex-wrap items-baseline gap-x-2 ${p?.verdict_in_plain_words ? 'text-lg' : 'text-[32px] sm:text-[40px] leading-tight'}`}>
            <span className={`font-serif font-semibold fam-${fam}`}><Term k="label">{label}</Term></span>
            {easy && <span className="text-base text-ink-soft">= {easy}</span>}
          </p>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-hair p-4">
          <h3 className="font-serif text-xl">What this means for you</h3>
          {p?.what_this_means ? <p className="mt-1 text-[15px]">{p.what_this_means}</p>
            : s.scores || over(s) ? <div className="md mt-1 text-[15px]"><Md>{firstPara(v?.body) || 'See the full report below.'}</Md></div> : <Skel />}
        </div>
        <div className="rounded-md border border-hair p-4">
          <h3 className="font-serif text-xl"><Term k="sure">How sure are we?</Term></h3>
          {conf != null && (
            <div className="mt-2">
              <div className="flex justify-between text-sm"><span className="font-medium">{sureWords(conf)}</span><span className="text-ink-soft">{conf}%</span></div>
              <div className="meter mt-1" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={conf} aria-label="How sure the council is">
                <span style={{ width: `${conf}%`, background: `var(--${conf >= 70 ? 'go' : conf >= 45 ? 'caution' : 'stop'})` }} />
              </div>
            </div>
          )}
          {p?.confidence_in_plain_words ? <p className="mt-2 text-[15px]">{p.confidence_in_plain_words}</p> : conf == null && !over(s) ? <Skel n={2} /> : null}
          {s.scores?.overall != null && (
            <p className="mt-2 text-sm text-ink-soft"><Term k="health">Health score</Term>: <span className="font-medium text-ink">{Math.round(s.scores.overall)} out of 100</span></p>
          )}
        </div>
      </div>

      {assumption && (
        <div className="mt-4 rounded-md border border-caution/50 bg-caution/10 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide fam-caution">The riskiest guess in this plan</p>
          <div className="md mt-1 text-[15px]"><Md>{assumption}</Md></div>
        </div>
      )}
    </section>
  )
}
const over = (s: CaseState) => s.status === 'done' || s.status === 'error' || s.status === 'interrupted'
const firstPara = (t?: string) => t?.split(/\n\s*\n/).find((x) => x.trim())?.trim()

// ---- 90-day plan ----
const WEEKS = 13
const PHASE_COLORS = ['var(--ghost)', 'var(--caution)', 'var(--go)', 'var(--seal)', '#6250d6']
const wk = (n: unknown, lo = 1) => Math.min(WEEKS, Math.max(lo, Math.round(Number(n)) || lo))
const span = (a?: number, b?: number) => { const s0 = wk(a); return [s0, wk(b ?? s0, s0)] as const }
const weeksText = (t: { start_week?: number; end_week?: number }) => { const [a, b] = span(t.start_week, t.end_week); return a === b ? `Week ${a}` : `Weeks ${a}–${b}` }

export function PlanSection({ plan, pending, title }: { plan?: Plan; pending: boolean; title?: string }) {
  const [sel, setSel] = useState<string>()
  if (!plan) {
    if (!pending) return null
    return (
      <section id="plan" className="entry">
        <h2 className="font-serif text-[28px]">Your 90-day plan</h2>
        <p className="text-sm text-ink-soft">Making a week-by-week plan from the verdict…</p>
        <Skel n={4} />
      </section>
    )
  }
  const tasks = (plan.tasks ?? []).filter((t) => t.title).map((t, i) => ({ ...t, id: t.id || `t${i + 1}` }))
  // Phases in order; tasks with an unknown phase get their own group.
  const phases = [...(plan.phases ?? []).filter((p) => p.name)]
  for (const t of tasks) if (t.phase && !phases.some((p) => p.name === t.phase)) phases.push({ name: t.phase })
  const groups = phases.map((p, i) => {
    const own = tasks.filter((t) => t.phase === p.name)
    const start = p.start_week ?? Math.min(...own.map((t) => t.start_week ?? 1), WEEKS)
    const end = p.end_week ?? Math.max(...own.map((t) => t.end_week ?? t.start_week ?? 1), 1)
    return { name: p.name!, color: PHASE_COLORS[i % PHASE_COLORS.length], span: span(start, end), tasks: own }
  })
  const loose = tasks.filter((t) => !t.phase)
  if (loose.length) groups.push({ name: 'Other', color: PHASE_COLORS[groups.length % PHASE_COLORS.length], span: span(1, WEEKS), tasks: loose })
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))
  const picked = sel ? byId[sel] : undefined
  const colorOf = (t: PlanTask) => groups.find((g) => g.tasks.some((x) => x.id === t.id))?.color ?? 'var(--ghost)'

  const downloadCsv = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + planCsv(plan)], { type: 'text/csv' }))
    a.download = `90-day-plan-${(title || 'case').slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const cells = () =>
    Array.from({ length: WEEKS }, (_, i) => (
      <span key={i} aria-hidden className={`gw ${i === 4 || i === 8 ? 'm' : ''}`} style={{ gridColumn: i + 2, gridRow: 1 }} />
    ))

  return (
    <section id="plan" className="entry">
      <h2 className="font-serif text-[28px]">Your {plan.horizon_days ?? 90}-day plan</h2>
      {plan.goal && <p className="mt-1 max-w-[68ch] text-[15px]"><span className="text-ink-soft">Goal: </span>{plan.goal}</p>}

      {plan.first_step_this_week && (
        <div className="first-step mt-4 rounded-md px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide">Do this first (this week)</p>
          <p className="mt-1 font-serif text-[20px] leading-snug">{plan.first_step_this_week}</p>
        </div>
      )}

      {tasks.length > 0 && (
        <>
          <p className="no-print mt-4 text-xs text-ink-soft">Tap or hover a bar to see why it matters. Scroll sideways on a phone.</p>
          <div className="gantt-wrap mt-2" role="figure" aria-label="90-day plan as a timeline, weeks 1 to 13">
            <div className="gantt">
              <div className="g-row g-head">
                <span className="g-name" />
                {[['Month 1', 2, 6], ['Month 2', 6, 10], ['Month 3', 10, 15]].map(([m, a, b]) => (
                  <span key={m} className="g-month" style={{ gridColumn: `${a} / ${b}`, gridRow: 1 }}>{m}</span>
                ))}
              </div>
              <div className="g-row g-head">
                <span className="g-name text-ink-soft">Task</span>
                {Array.from({ length: WEEKS }, (_, i) => (
                  <span key={i} className={`g-week ${i === 4 || i === 8 ? 'm' : ''}`} style={{ gridColumn: i + 2, gridRow: 1 }}>W{i + 1}</span>
                ))}
              </div>
              {groups.map((g) => (
                <div key={g.name} role="group" aria-label={g.name}>
                  <div className="g-row g-phase">
                    <span className="g-name font-semibold" style={{ color: g.color }}>{g.name}</span>
                    {cells()}
                    <span className="g-bar phase" style={{ gridColumn: `${g.span[0] + 1} / ${g.span[1] + 2}`, gridRow: 1, background: g.color }} />
                  </div>
                  {g.tasks.map((t) => {
                    const [a, b] = span(t.start_week, t.end_week)
                    return (
                      <div key={t.id} className={`g-row ${sel === t.id ? 'on' : ''}`}>
                        <span className="g-name text-sm" title={t.title}>{t.title}</span>
                        {cells()}
                        <button type="button" className="g-bar" style={{ gridColumn: `${a + 1} / ${b + 2}`, gridRow: 1, background: g.color }}
                          aria-label={`${t.title}, ${weeksText(t)}. Show details`} aria-pressed={sel === t.id}
                          onClick={() => setSel(sel === t.id ? undefined : t.id)} onMouseEnter={() => setSel(t.id)} />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div aria-live="polite">
            {picked && (
              <div className="mt-3 rounded-md border border-hair p-4 text-[15px]" style={{ borderLeft: `4px solid ${colorOf(picked)}` }}>
                <p className="font-serif text-lg font-semibold">{picked.title}</p>
                <p className="text-sm text-ink-soft">{weeksText(picked)}{picked.phase && ` · ${picked.phase}`}{picked.owner && ` · Who: ${picked.owner}`}</p>
                {picked.why && <p className="mt-1"><span className="text-ink-soft">Why: </span>{picked.why}</p>}
                {picked.success_metric && <p><span className="text-ink-soft">Done when: </span>{picked.success_metric}</p>}
                {!!picked.depends_on?.length && (
                  <p><span className="text-ink-soft">Do these first: </span>{picked.depends_on.map((d) => byId[d]?.title ?? d).join('; ')}</p>
                )}
              </div>
            )}
          </div>

          <div className="md mt-4 !max-w-none">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Task</th><th>When</th><th>Who</th><th>Done when</th></tr></thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(t) }} aria-hidden />{t.title}</td>
                      <td className="whitespace-nowrap">{weeksText(t)}</td>
                      <td>{t.owner ?? '–'}</td>
                      <td>{t.success_metric ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="no-print mt-3 flex flex-wrap gap-2 text-sm">
            <button className="btn btn-line" onClick={downloadCsv}>Download plan (.csv)</button>
          </div>
        </>
      )}
    </section>
  )
}

const REVIEW: { key: 'strengths' | 'risks' | 'stop_doing'; title: string; icon: string; fam: string }[] = [
  { key: 'strengths', title: 'What’s working for you', icon: '✓', fam: 'go' },
  { key: 'risks', title: 'What could hurt you', icon: '⚠', fam: 'caution' },
  { key: 'stop_doing', title: 'Stop doing', icon: '✋', fam: 'stop' },
]

export function Review({ plan }: { plan?: Plan }) {
  const r = plan?.review
  if (!r || !REVIEW.some((x) => r[x.key]?.length)) return null
  return (
    <section id="review" className="entry">
      <h2 className="font-serif text-[28px]">Detailed review</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {REVIEW.filter((x) => r[x.key]?.length).map((x) => (
          <div key={x.key} className="rounded-md border border-hair p-4" style={{ borderTop: `3px solid var(--${x.fam})` }}>
            <h3 className={`font-serif text-xl fam-${x.fam}`}><span aria-hidden>{x.icon} </span>{x.title}</h3>
            <ul className="mt-2 space-y-1.5 text-[15px]">
              {r[x.key]!.map((t, i) => <li key={i} className="flex gap-2"><span aria-hidden className={`fam-${x.fam}`}>•</span><span>{t}</span></li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
