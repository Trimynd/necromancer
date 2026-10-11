// Verdict dashboard (gauge, radar, council, evidence mix, run stats) and the report document with its contents list.
import type { ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bar, BarChart, Cell, Legend, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { familyOf, roundOf, sumSources, type CaseState, type Family } from './lib'
import { srcLabel } from './Ghost'

// Fixed categorical order (validated palette, slots 1-5 + 7); colour follows the source type, never its rank.
const SRC_COLORS: Record<string, string> = {
  web: '#2a78d6', news: '#eb6834', 'Your document': '#1baf7a', reddit: '#eda100', finance: '#e87ba4', other: '#6250d6',
}
const srcColor = (k: string) => SRC_COLORS[k] ?? SRC_COLORS.other

const tip = {
  contentStyle: { background: 'var(--sheet)', border: '1px solid var(--hair)', borderRadius: 6, fontSize: 13, color: 'var(--ink)' },
  itemStyle: { color: 'var(--ink)' },
  labelStyle: { color: 'var(--ink-soft)' },
}

function Card({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`rounded-md border border-hair p-4 ${wide ? 'md:col-span-2' : ''}`}>
      <figcaption className="mb-2 font-serif text-lg">{title}</figcaption>
      {children}
    </figure>
  )
}

export function Gauge({ value, label, family }: { value?: number; label?: string; family?: Family }) {
  const v = Math.max(0, Math.min(100, value ?? 0))
  const fam = family ?? (v >= 67 ? 'go' : v >= 40 ? 'caution' : 'stop')
  return (
    <svg viewBox="0 0 200 118" className="mx-auto block w-full max-w-[260px]" role="img" aria-label={value == null ? 'Score pending' : `Overall score ${v} of 100${label ? `, ${label}` : ''}`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--hair)" strokeWidth="14" strokeLinecap="round" />
      {value != null && (
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke={`var(--${fam})`} strokeWidth="14" strokeLinecap="round"
          pathLength={100} strokeDasharray={`${v} 100`} className="gauge-arc" />
      )}
      <text x="100" y="84" textAnchor="middle" fontSize="34" fontWeight="600" fontFamily="Newsreader, serif" fill="var(--ink)">{value == null ? '–' : v}</text>
      <text x="100" y="106" textAnchor="middle" fontSize="13" fontWeight="600" fill={`var(--${fam})`}>{label ?? (value == null ? 'scoring…' : '/ 100')}</text>
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
      Confidence: Math.round((last.confidence ?? 0) * 100),
      'Search quality': r?.search_quality != null ? Math.round(r.search_quality * 100) : 0,
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
    ['Ghosts', String(s.ghosts.length)],
    ['Rounds', String(rounds || '–')],
    ['Sources read', sources ? String(sources) : '–'],
    ['Tokens', tokens ? tokens.toLocaleString() : '…'],
  ]

  return (
    <section id="dashboard" className="entry" aria-labelledby="dash-title">
      <h2 id="dash-title" className="font-serif text-[28px]">Verdict dashboard</h2>
      <p className="mt-1 text-sm text-ink-soft">The Soul Binder's scores and how the council argued, at a glance.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Overall score">
          <Gauge value={sc?.overall} label={label} family={fam} />
          <p className="mt-1 text-center text-sm text-ink-soft">
            {sc ? (fam === 'go' ? 'Worth pursuing.' : fam === 'stop' ? 'Not as it stands.' : 'Promising, with changes.') : 'Scores arrive just before the verdict.'}
          </p>
        </Card>

        <Card title="Where it's strong and weak">
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
            <ul className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-ink-soft">
              {dims.map((d) => <li key={d.k} className="flex justify-between gap-2"><span>{d.k}</span><span className="text-ink">{d.v}/10</span></li>)}
            </ul>
          )}
        </Card>

        <Card title="The council" wide>
          {council.length ? (
            <>
              <div style={{ height: council.length * 56 + 60 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={council} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barGap={2} barCategoryGap="28%">
                    <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: 'var(--ink-soft)', fontSize: 11 }} stroke="var(--hair)" />
                    <YAxis type="category" dataKey="name" width={140} tick={<StatusTick rows={council} />} stroke="var(--hair)" />
                    <Tooltip {...tip} cursor={{ fill: 'var(--hair)' }} labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ''} />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--ink-soft)' }} />
                    <Bar dataKey="Confidence" isAnimationActive={false} fill="var(--ghost)" radius={[0, 4, 4, 0]} barSize={10} />
                    <Bar dataKey="Search quality" isAnimationActive={false} fill="var(--seal)" radius={[0, 4, 4, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-xs text-ink-soft">Name colour: <span className="fam-go">✓ accepted</span> · <span className="fam-stop">↺ sent back</span>. R = rounds it took.</p>
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

// ---------- report ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const textOf = (n: any): string => (n?.value ?? '') + (n?.children ?? []).map(textOf).join('')

const mdComponents: Components = {
  a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer" />,
  table: ({ node: _n, ...p }) => <div className="table-wrap"><table {...p} /></div>,
  tr: ({ node, ...p }) => <tr {...p} className={textOf(node).includes('⚠') ? 'warn' : undefined} />,
}

export const Md = ({ children }: { children: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{children}</ReactMarkdown>
)

export function Report({ md, streaming, family }: { md: string; streaming: boolean; family?: Family }) {
  const parts = md.split(/^(?=## )/m).filter((p) => p.trim())
  const secs = parts.map((p, i) => {
    const title = p.startsWith('## ') ? p.slice(3, p.indexOf('\n') < 0 ? undefined : p.indexOf('\n')).trim() : ''
    return { id: `r-${i}`, title, body: p }
  })
  const toc = secs.filter((x) => x.title)
  return (
    <div className="report-grid">
      {toc.length > 1 && (
        <nav aria-label="Report contents" className="toc no-print">
          <p className="mb-1 text-sm font-medium">Contents</p>
          <ol className="text-sm">
            {toc.map((x) => (
              <li key={x.id}><a href={`#${x.id}`} className="block truncate py-0.5 text-ink-soft hover:text-ink">{x.title.replace(/\s*\(.*\)\s*$/, '')}</a></li>
            ))}
          </ol>
        </nav>
      )}
      <div className={`md min-w-0 ${streaming ? 'caret' : ''}`}>
        {secs.map((x, i) => (
          <section
            key={x.id}
            id={x.id}
            className={`report-sec ${/^1\.\s*verdict/i.test(x.title) || (i === 0 && !x.title) ? 'sec-verdict' : ''} ${/verified by code/i.test(x.title) ? 'sec-verified' : ''}`}
            style={family ? ({ ['--fam' as string]: `var(--${family})` }) : undefined}
          >
            <Md>{x.body}</Md>
          </section>
        ))}
      </div>
    </div>
  )
}
