// Verdict dashboard (gauge, radar, council, evidence mix, run stats). Lazy-loaded: it pulls in recharts.
import { useState, type ReactNode } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { familyOf, roundOf, statsOf, sumSources, type CaseState, type Doc, type Family } from './lib'
import { srcLabel } from './Ghost'
import { Term } from './Plan'

// Fixed categorical order (validated palette, slots 1-5 + 7); colour follows the source type, never its rank.
const SRC_COLORS: Record<string, string> = {
  web: '#3b82f6', news: '#f59e0b', 'Your document': '#10b981', reddit: '#a855f7', finance: '#eab308', other: '#78929e',
}
const srcColor = (k: string) => SRC_COLORS[k] ?? SRC_COLORS.other

const tip = {
  contentStyle: { background: 'var(--sheet)', border: '1px solid var(--hair)', borderRadius: 2, fontSize: 13, color: 'var(--ink)' },
  itemStyle: { color: 'var(--ink)' },
  labelStyle: { color: 'var(--ink-soft)' },
}

function Card({ title, children, wide }: { title: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`rounded-md border border-hair p-4 ${wide ? 'md:col-span-2' : ''}`}>
      <figcaption className="mb-2 font-serif text-lg">{title}</figcaption>
      {children}
    </figure>
  )
}

export function Gauge({ value, label, family, pending = true }: { value?: number; label?: string; family?: Family; pending?: boolean }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  const fam = family ?? (v >= 67 ? 'go' : v >= 40 ? 'caution' : 'stop')
  return (
    <svg viewBox="0 0 200 118" className="mx-auto block w-full max-w-[260px]" role="img" aria-label={value == null ? 'Health score not available' : `Health score ${v} out of 100${label ? `, ${label}` : ''}`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--hair)" strokeWidth="14" strokeLinecap="round" />
      {value != null && (
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={`var(--${fam})`} strokeWidth="14" strokeLinecap="round"
          pathLength={100} strokeDasharray={`${v} 100`} className="gauge-arc" />
      )}
      <text x="100" y="84" textAnchor="middle" fontSize="34" fontWeight="600" fontFamily="Bricolage Grotesque, sans-serif" fill="var(--ink)">{value == null ? '–' : v}</text>
      <text x="100" y="106" textAnchor="middle" fontSize="13" fontWeight="600" fill={`var(--${fam})`}>{label ?? (value != null ? '/ 100' : pending ? 'working it out…' : '')}</text>
    </svg>
  )
}

export function Dashboard({ s, seconds }: { s: CaseState; seconds?: number }) {
  const sc = s.scores
  const narrow = matchMedia('(max-width: 480px)').matches // full names stay in the list under the radar
  const dims = Object.entries(sc?.dimensions ?? {}).map(([k, v]) => ({ k, v: Number(v) || 0 }))
  const ghosts = s.ghosts.filter((g) => g.cases.length)
  const council = ghosts.map((g) => {
    const last = g.cases[g.cases.length - 1]
    const r = g.rulings[g.rulings.length - 1]?.ruling
    const st = g.phase === 'accepted' ? 'accepted' : r?.decision === 'retry' ? 'sent back' : 'pending'
    const short = g.name.split(/[,(]/)[0].trim()
    return {
      name: `${short.length > 16 ? short.slice(0, 15) + '…' : short} · R${roundOf(g)}`,
      full: g.name,
      'How sure': Math.round((last.confidence ?? 0) * 100),
      'How well they researched': r?.search_quality != null ? Math.round(r.search_quality * 100) : 0,
      st,
    }
  })
  const mix = Object.entries(
    s.ghosts.reduce<Record<string, number>>((m, g) => {
      for (const e of g.cases[g.cases.length - 1]?.evidence ?? []) m[srcLabel(e.source_type)] = (m[srcLabel(e.source_type)] ?? 0) + 1
      return m
    }, {}),
  ).map(([name, value]) => ({ name, value }))
  const tokens = Object.values(s.usage ?? {}).reduce((n, u) => n + (u.input ?? 0) + (u.output ?? 0) + (u.thinking ?? 0), 0)
  const rounds = Math.max(0, ...s.ghosts.map(roundOf))
  const sources = sumSources(s.research)
  const label = sc?.label
  const fam = label ? familyOf(label) : undefined

  const stats: [string, string][] = [
    ['Total time', seconds != null ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '–'],
    ['Experts', String(s.ghosts.length)],
    ['Rounds', String(rounds || '–')],
    ['Sources read', sources ? String(sources) : '–'],
    ['Tokens', tokens ? tokens.toLocaleString() : '…'],
  ]

  return (
    <section id="dashboard" className="entry" aria-labelledby="dash-title">
      <h2 id="dash-title" className="font-serif text-[28px]">The numbers behind the answer</h2>
      <p className="mt-1 text-sm text-ink-soft">How your idea scored, and how strongly each expert backed their view.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title={<Term k="health">Health score (out of 100)</Term>}>
          <Gauge value={sc?.overall} label={label} family={fam} pending={!s.verdict && s.status !== 'done' && s.status !== 'error'} />
          <p className="mt-1 text-center text-sm text-ink-soft">
            {sc ? (fam === 'go' ? 'Worth doing.' : fam === 'stop' ? 'Not the way it is now.' : 'Can work, with changes.') : s.verdict ? 'No score for this case.' : 'Working out the score…'}
          </p>
        </Card>

        <Card title="Where it's strong and weak (0–10)">
          {dims.length ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={dims} outerRadius={narrow ? '50%' : '68%'}>
                  <PolarGrid stroke="var(--hair)" />
                  <PolarAngleAxis dataKey="k" tick={{ fill: 'var(--ink-soft)', fontSize: 11 }} tickFormatter={(k: string) => (narrow ? k.split(/[\s&]/)[0] : k)} />
                  <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                  <Radar dataKey="v" isAnimationActive={false} name="Score (0–10)" stroke="var(--seal)" strokeWidth={2} fill="var(--seal)" fillOpacity={0.18} dot={{ r: 4, fill: 'var(--seal)' }} />
                  <Tooltip {...tip} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : <Skeleton />}
          {dims.length > 0 && (
            <ul className="mt-2 space-y-2.5 text-sm">
              {dims.map((d) => {
                const c = d.v < 4 ? 'stop' : d.v < 7 ? 'caution' : 'go'
                const note = sc?.plain?.dimension_notes?.[d.k]
                return (
                  <li key={d.k}>
                    <div className="flex justify-between gap-2"><Term k={d.k}>{d.k}</Term><span className={`font-medium fam-${c}`}>{d.v}/10</span></div>
                    <div className="dim-bar mt-0.5"><span style={{ width: `${Math.max(0, Math.min(10, d.v)) * 10}%`, background: `var(--${c})` }} /></div>
                    {note && <p className="mt-0.5 text-ink-soft">{note}</p>}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card title={<Term k="council">What each expert said</Term>} wide>
          {council.length ? (
            <>
              <div style={{ height: council.length * 56 + 60 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={council} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barGap={2} barCategoryGap="28%">
                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: 'var(--ink-soft)', fontSize: 11 }} stroke="var(--hair)" />
                    <YAxis type="category" dataKey="name" width={140} tick={<StatusTick rows={council} />} stroke="var(--hair)" />
                    <Tooltip {...tip} cursor={{ fill: 'var(--hair)' }} labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ''} />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--ink-soft)' }} />
                    <Bar dataKey="How sure" isAnimationActive={false} fill="var(--ghost)" radius={[0, 4, 4, 0]} barSize={10} />
                    <Bar dataKey="How well they researched" isAnimationActive={false} fill="var(--seal)" radius={[0, 4, 4, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-xs text-ink-soft"><Term k="sure">How sure</Term> = how confident the expert was. <Term k="research">How well they researched</Term> = how well they backed it with sources.
                <br /><span className="fam-go">✓ accepted</span> · <span className="fam-stop">↺ sent back to dig deeper</span>. R = rounds it took.</p>
            </>
          ) : <Skeleton />}
        </Card>

        <Card title="Where the evidence came from">
          {mix.length ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="h-[170px] w-[170px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mix} isAnimationActive={false} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2} stroke="var(--sheet)" strokeWidth={2}>
                      {mix.map((m) => <Cell key={m.name} fill={srcColor(m.name)} />)}
                    </Pie>
                    <Tooltip {...tip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1 text-sm">
                {mix.map((m) => (
                  <li key={m.name} className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: srcColor(m.name) }} aria-hidden />
                    <span>{m.name}</span><span className="text-ink-soft">{m.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <Skeleton />}
        </Card>

        <Card title="This run">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map(([k, v]) => (
              <div key={k} className="rounded-md bg-paper px-3 py-2">
                <dt className="text-xs text-ink-soft">{k}</dt>
                <dd className="font-serif text-[22px] leading-tight">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </section>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatusTick({ x, y, payload, rows }: any) {
  const row = rows.find((r: { name: string }) => r.name === payload.value)
  const fam = row?.st === 'accepted' ? 'var(--go)' : row?.st === 'sent back' ? 'var(--stop)' : 'var(--ink-soft)'
  const icon = row?.st === 'accepted' ? '✓ ' : row?.st === 'sent back' ? '↺ ' : ''
  return <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={fam}>{icon}{payload.value}</text>
}

const Skeleton = () => (
  <div className="space-y-2 py-4" aria-label="Loading"><div className="skel w-full" /><div className="skel w-5/6" /><div className="skel w-2/3" /></div>
)


// ---- "Your numbers": the user's own sheet / CSV ----
const LINE_COLORS = ['#14b8a6', '#a855f7', '#f59e0b', '#3b82f6']
/** Columns where going up is bad news. */
const UP_IS_BAD = /cost|expense|churn|return|refund|complaint|debt|loss/i
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
const pretty = (c: string) => c.replace(/_/g, ' ')

export function Numbers({ doc }: { doc: Doc }) {
  const t = doc.table!
  const stats = doc.stats ?? statsOf(t)
  const numeric = Object.keys(stats).filter((c) => t.columns.includes(c))
  const xi = t.columns.findIndex((c) => !stats[c])
  const lines = numeric.slice(0, 4)
  const [hidden, setHidden] = useState<string[]>([])
  const [all, setAll] = useState(false)
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v).replace(/[,₹$%\s]/g, '')))
  const data = t.rows.map((r, i) => ({
    x: xi >= 0 ? String(r[xi]) : `Row ${i + 1}`,
    ...Object.fromEntries(lines.map((c) => [c, num(r[t.columns.indexOf(c)])])),
  }))
  // Callouts on the headline column (revenue/sales if there is one): biggest row-to-row drop, best row.
  const main = numeric.find((c) => /revenue|sales|income|profit|orders/i.test(c)) ?? numeric[0]
  let drop: { from: string; to: string; pct: number } | undefined
  let best: { x: string; v: number } | undefined
  if (main) {
    const ys = t.rows.map((r) => num(r[t.columns.indexOf(main)]))
    ys.forEach((y, i) => {
      if (Number.isFinite(y) && (!best || y > best.v)) best = { x: data[i].x, v: y }
      const prev = ys[i - 1]
      if (i && prev && y < prev) {
        const pct = ((y - prev) / Math.abs(prev)) * 100
        if (!drop || pct < drop.pct) drop = { from: data[i - 1].x, to: data[i].x, pct }
      }
    })
  }
  const rows = all ? t.rows : t.rows.slice(0, 12)

  return (
    <section id={`numbers-${doc.id}`} className="entry">
      <h2 className="font-serif text-[28px]">Your numbers</h2>
      <p className="text-sm text-ink-soft">
        From your {doc.kind === 'sheet' ? 'sheet' : 'file'}: <span className="font-medium text-ink">{doc.name}</span> · these are your real numbers, not estimates.
      </p>

      {numeric.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {numeric.map((c) => {
            const st = stats[c]
            const good = st.trend === 'flat' ? undefined : (st.trend === 'up') !== UP_IS_BAD.test(c)
            return (
              <div key={c} className="rounded-md border border-hair px-3 py-2">
                <dt className="truncate text-xs text-ink-soft" title={c}>{pretty(c)}</dt>
                <dd className="font-serif text-[22px] leading-tight">{fmt(st.last)}</dd>
                <dd className={`text-sm ${good == null ? 'text-ink-soft' : good ? 'fam-go' : 'fam-stop'}`}>
                  {st.change_pct == null ? '–' : `${st.change_pct > 0 ? '▲' : st.change_pct < 0 ? '▼' : '■'} ${Math.abs(st.change_pct)}%`}
                  <span className="text-ink-soft"> since first row</span>
                </dd>
                <dd className="text-xs text-ink-soft">range {fmt(st.min)} – {fmt(st.max)}</dd>
              </div>
            )
          })}
        </dl>
      )}

      {lines.length > 0 && data.length > 1 && (
        <figure className="mt-4 rounded-md border border-hair p-4">
          <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Lines to show">
            {lines.map((c, i) => {
              const on = !hidden.includes(c)
              return (
                <button key={c} type="button" aria-pressed={on} className={`chip !px-2.5 !py-0.5 text-sm ${on ? '' : 'opacity-50'}`}
                  style={{ borderColor: LINE_COLORS[i] }}
                  onClick={() => setHidden(on ? [...hidden, c] : hidden.filter((h) => h !== c))}>
                  <span aria-hidden style={{ color: LINE_COLORS[i] }}>●</span> {pretty(c)}
                </button>
              )
            })}
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--hair)" vertical={false} />
                <XAxis dataKey="x" tick={{ fontSize: 12, fill: 'var(--ink-soft)' }} stroke="var(--hair)" />
                {/* ponytail: one hidden axis per line so ₹ lakhs and footfall share a chart; tooltip shows real values. */}
                {lines.map((c) => <YAxis key={c} yAxisId={c} hide domain={['auto', 'auto']} />)}
                <Tooltip {...tip} formatter={(v, n) => [fmt(Number(v)), pretty(String(n))]} />
                {lines.map((c, i) => !hidden.includes(c) && (
                  <Line key={c} yAxisId={c} type="monotone" dataKey={c} stroke={LINE_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="mt-1 text-xs text-ink-soft">Each line is scaled to its own range, so you see the shape; hover for the values.</figcaption>
        </figure>
      )}

      {main && (drop || best) && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {drop && (
            <li className="rounded-md border border-hair px-3 py-1.5">
              <span className="fam-stop">Biggest drop</span> in {pretty(main)}: {drop.from} → {drop.to} ({drop.pct.toFixed(1)}%)
            </li>
          )}
          {best && (
            <li className="rounded-md border border-hair px-3 py-1.5">
              <span className="fam-go">Best period</span> for {pretty(main)}: {best.x} ({fmt(best.v)})
            </li>
          )}
        </ul>
      )}

      <div className="mt-4 max-h-96 overflow-auto rounded-md border border-hair">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-sheet">
            <tr>{t.columns.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-3 py-1.5 text-left font-medium">{pretty(c)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-hair">
                {r.map((v, j) => (
                  <td key={j} className={`whitespace-nowrap px-3 py-1 ${typeof v === 'number' ? 'text-right tabular-nums' : ''}`}>{typeof v === 'number' ? fmt(v) : v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.rows.length > 12 && (
        <button type="button" className="mt-2 text-sm text-seal underline" onClick={() => setAll(!all)}>
          {all ? 'Show first 12 rows' : `Show all ${t.rows.length} rows`}
        </button>
      )}
    </section>
  )
}
