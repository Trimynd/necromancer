import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { compareWorkbooks, saveRecent, sheetAsFile, startCase, type Comparison } from './lib'

const MAX_FILES = 6
const MAX_MB = 5
const ACCEPT = ['xlsx', 'xlsm', 'csv']

const SAMPLES: { title: string; note: string; files: string[] }[] = [
  { title: 'Zomato FY23 → FY24', note: 'Loss to first profit', files: ['zomato_fy2023.xlsx', 'zomato_fy2024.xlsx'] },
  { title: 'Paytm FY24 → FY25', note: 'After the RBI action', files: ['paytm_fy2024.xlsx', 'paytm_fy2025.xlsx'] },
  { title: 'Nykaa FY25 vs what-if', note: 'Same rows, expenses +3%', files: ['nykaa_fy2025.xlsx', 'nykaa_fy2025_whatif.xlsx'] },
  {
    title: 'All six ledgers', note: 'A verdict for each',
    files: ['zomato_fy2023.xlsx', 'zomato_fy2024.xlsx', 'paytm_fy2024.xlsx', 'paytm_fy2025.xlsx', 'nykaa_fy2025.xlsx', 'nykaa_fy2025_whatif.xlsx'],
  },
]

// Code-computed labels (backend spreadsheets.VERDICTS) -> the court's verdict colours.
const FAMILY: Record<string, 'go' | 'caution' | 'stop'> = {
  SCALE: 'go', 'GROW WITH CARE': 'go', RECOVERABLE: 'caution', CRITICAL: 'stop',
}
const famColor = (label: string) => `var(--${FAMILY[label] ?? 'ghost'})`

const fmt = (v: unknown, digits = 1) =>
  v === null || v === undefined ? '—' : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: digits }) : String(v)
const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

function Delta({ value, suffix = '', lowerIsBetter = false, digits = 1 }: { value: number | null; suffix?: string; lowerIsBetter?: boolean; digits?: number }) {
  if (value === null || value === undefined) return <span className="text-ink-soft">—</span>
  if (value === 0) return <span className="text-ink-soft">0</span>
  const good = value > 0 !== lowerIsBetter
  return (
    <span className={`tabular-nums ${good ? 'fam-go' : 'fam-stop'}`}>
      {value > 0 ? '▲ +' : '▼ '}{fmt(value, digits)}{suffix}
    </span>
  )
}

function Meter({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-hair" role="meter" aria-valuemin={0} aria-valuemax={10} aria-valuenow={value ?? 0}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(value ?? 0) * 10}%`, background: color }} />
    </div>
  )
}

export function ComparePage() {
  const nav = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<Comparison | null>(null)
  const [pair, setPair] = useState<[number, number]>([0, 1])
  const [depth, setDepth] = useState<'fast' | 'deep'>('fast')
  const [trialBusy, setTrialBusy] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetBusy, setSheetBusy] = useState(false)

  // Google Sheets connector: the backend reads the shared sheet as CSV; it then joins the list like any upload.
  const addSheet = async () => {
    const u = sheetUrl.trim()
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(u)) { setErr('Paste a Google Sheets link (https://docs.google.com/spreadsheets/…).'); return }
    if (files.length >= MAX_FILES) { setErr(`Up to ${MAX_FILES} files, please.`); return }
    setSheetBusy(true)
    setErr('')
    try {
      const f = await sheetAsFile(u)
      setFiles((cur) => [...cur, f].slice(0, MAX_FILES))
      setSheetUrl('')
      setResult(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSheetBusy(false)
    }
  }

  useEffect(() => { document.title = 'Compare ledgers · Necromancer' }, [])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const msgs: string[] = []
    const next = [...files]
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ACCEPT.includes(ext)) msgs.push(`${f.name}: only Excel (.xlsx) or CSV files can be compared.`)
      else if (f.size > MAX_MB * 1024 * 1024) msgs.push(`${f.name} is ${fmtSize(f.size)}; the limit is ${MAX_MB} MB.`)
      else if (next.length >= MAX_FILES) { msgs.push(`Up to ${MAX_FILES} files, please.`); break }
      else next.push(f)
    }
    setFiles(next)
    setErr(msgs.join(' '))
    setResult(null)
  }

  const move = (i: number, dir: -1 | 1) => {
    const next = [...files]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    setFiles(next)
    setResult(null)
  }

  const run = async (list = files) => {
    if (list.length < 2) { setErr('Add at least two spreadsheets, oldest first.'); return }
    setBusy(true)
    setErr('')
    try {
      const r = await compareWorkbooks(list)
      setResult(r)
      setPair([0, 1])
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const loadSample = async (names: string[]) => {
    setErr('')
    try {
      const loaded = await Promise.all(names.map(async (n) => {
        const r = await fetch(`/samples/${n}`)
        if (!r.ok) throw new Error(`Sample ${n} is missing (run backend/scripts/make_sample_excels.py).`)
        return new File([await r.blob()], n, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      }))
      setFiles(loaded)
      setResult(null)
      await run(loaded)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  // /compare?sample=1 opens straight into a sample comparison (handy for demos).
  useEffect(() => {
    const n = Number(new URLSearchParams(location.search).get('sample'))
    if (SAMPLES[n - 1]) loadSample(SAMPLES[n - 1].files)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const diff = result?.diffs[`${pair[0]}-${pair[1]}`]
  const wa = result?.workbooks[pair[0]]
  const wb = result?.workbooks[pair[1]]

  const chart = useMemo(() => {
    if (!wa || !wb) return []
    const n = Math.max(wa.financials.periods.length, wb.financials.periods.length)
    return Array.from({ length: n }, (_, i) => ({
      period: [wa.financials.periods[i], wb.financials.periods[i]].filter(Boolean).filter((p, k, all) => all.indexOf(p) === k).join(' / '),
      revA: wa.financials.series.revenue?.[i] ?? null,
      revB: wb.financials.series.revenue?.[i] ?? null,
      profA: wa.financials.series.net_profit?.[i] ?? null,
      profB: wb.financials.series.net_profit?.[i] ?? null,
    }))
  }, [wa, wb])

  // Send the pair to the real court: both workbooks are already stored server-side as documents.
  const putOnTrial = async () => {
    if (!diff || !wa || !wb) return
    setTrialBusy(true)
    setErr('')
    const v = diff.verdict
    const text =
      `Compare these two financial spreadsheets of the same business: "${wa.name}" (earlier) and "${wb.name}" (later). ` +
      `A code-computed health score moved from ${v.overall.a ?? '?'} (${v.label.a}) to ${v.overall.b ?? '?'} (${v.label.b}). ` +
      `What changed between them, why did it change, and what should the business do next? Use the numbers in the sheets.`
    try {
      const document_ids = [wa.document_id, wb.document_id]
      const id = await startCase({ text, depth, document_ids })
      saveRecent({ id, title: `Ledgers: ${wa.name} → ${wb.name}`, text, depth, at: Date.now(), document_ids })
      nav(`/case/${id}`)
    } catch (e) {
      setErr(e instanceof Error ? `${e.message} Is the backend running on port 8000?` : String(e))
      setTrialBusy(false)
    }
  }

  const structural = diff ? [
    ...diff.cells.added_rows.map((r) => `+ row ${r}`), ...diff.cells.removed_rows.map((r) => `− row ${r}`),
    ...diff.cells.added_columns.map((c) => `+ column ${c}`), ...diff.cells.removed_columns.map((c) => `− column ${c}`),
  ] : []

  return (
    <div className="pt-2 sm:pt-6">
      <header className="mb-6 max-w-[70ch]">
        <p className="text-xs font-medium uppercase tracking-[.14em] text-ink-soft">The ledger comparison</p>
        <h1 className="mt-1 font-serif text-[32px] leading-tight sm:text-[44px]">How did the numbers move the verdict?</h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          Upload 2–6 Excel or CSV files of a business, oldest first. Each gets a health verdict computed in plain code from its
          own numbers (the same numbers always give the same verdict), and each later file is also judged against the one before it.
          Pick any two to see every changed cell and how it moved the verdict, then put them on trial before the council.
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 space-y-3" aria-label="Upload spreadsheets">
          <div
            className={`rounded-md border border-dashed p-5 text-sm transition-colors ${dragging ? 'border-seal bg-sheet' : 'border-hair'}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Drop spreadsheets here, or</span>
              <label className="btn btn-line cursor-pointer !px-3 !py-1 focus-within:outline-2 focus-within:outline-seal">
                Choose files
                <input type="file" multiple accept={ACCEPT.map((x) => '.' + x).join(',')} className="sr-only"
                       onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
              </label>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              XLSX or CSV · up to {MAX_FILES} files, {MAX_MB} MB each · one row per period, with columns like Revenue, Expenses, Net Profit, Customers.
            </p>

            <div className="mt-3 border-t border-hair pt-3">
              <label htmlFor="sheet-url" className="font-medium"><span aria-hidden>📗</span> Or add a Google Sheet</label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  id="sheet-url" type="url" className="field min-w-0 flex-1 !py-1.5" placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSheet() } }}
                />
                <button type="button" className="btn btn-line !px-3 !py-1" onClick={addSheet} disabled={sheetBusy || !sheetUrl.trim()}>
                  {sheetBusy ? 'Reading…' : 'Add sheet'}
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                Share it first: <b>Share</b> → General access → <b>Anyone with the link</b> → <b>Viewer</b>. Add a <code>#gid=…</code> link to pick a tab.
              </p>
            </div>

            {files.length > 0 && (
              <ol className="mt-3 space-y-1.5" aria-label="Files to compare, oldest first">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md bg-sheet px-3 py-2">
                    <span className="w-5 text-xs text-ink-soft tabular-nums">{i + 1}.</span>
                    <span aria-hidden>{f.name.toLowerCase().endsWith('.csv') ? '📊' : '📒'}</span>
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-ink-soft">{fmtSize(f.size)}</span>
                    <button type="button" aria-label={`Move ${f.name} earlier`} disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-ink-soft hover:text-ink disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Move ${f.name} later`} disabled={i === files.length - 1} onClick={() => move(i, 1)} className="px-1 text-ink-soft hover:text-ink disabled:opacity-30">↓</button>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => { setFiles(files.filter((_, k) => k !== i)); setResult(null) }} className="px-1 text-ink-soft hover:text-ink">✕</button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-seal" disabled={busy || files.length < 2} onClick={() => run()}>
              {busy ? 'Comparing…' : 'Compare ledgers'}
            </button>
            {files.length === 1 && <span className="text-sm text-ink-soft">Add one more file.</span>}
          </div>
          {err && <p role="alert" className="fam-stop text-sm">{err}</p>}
        </section>

        <aside className="min-w-0">
          <h2 className="font-serif text-xl">Sample ledgers</h2>
          <p className="text-xs text-ink-soft">Public quarterly results (₹ crore), sources inside each file.</p>
          <ul className="mt-2 space-y-1.5">
            {SAMPLES.map((s) => (
              <li key={s.title}>
                <button type="button" disabled={busy} onClick={() => loadSample(s.files)}
                        className="btn btn-line flex w-full items-center justify-between gap-3 !px-3 !py-2 text-left disabled:opacity-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.title}</span>
                    <span className="block truncate text-xs text-ink-soft">{s.note}</span>
                  </span>
                  <span aria-hidden className="text-seal">→</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">Download:</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {SAMPLES[3].files.map((n) => (
              <a key={n} href={`/samples/${n}`} download className="underline underline-offset-2 hover:text-ink text-ink-soft">{n}</a>
            ))}
          </div>
        </aside>
      </div>

      {result && (
        <div ref={resultsRef} className="mt-10 scroll-mt-4 space-y-8">
          <section aria-label="Verdict per ledger">
            <h2 className="font-serif text-2xl">Verdict per ledger</h2>
            <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {result.workbooks.map((w) => {
                const color = famColor(w.verdict.label)
                const selected = pair.includes(w.index)
                return (
                  <article key={w.index} className={`sheet appear rounded-md p-4 ${selected ? 'ring-1 ring-seal/50' : ''}`}>
                    <p className="truncate text-xs text-ink-soft">{w.index + 1}. {w.name}</p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="font-serif text-[40px] font-semibold leading-none tabular-nums">{w.verdict.overall ?? '—'}</span>
                      <span className="text-xs font-semibold tracking-wide" style={{ color }}>{w.verdict.label}</span>
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">{w.verdict.headline}</p>
                    <dl className="mt-3 space-y-1.5">
                      {Object.entries(w.verdict.dimensions).map(([k, v]) => (
                        <div key={k}>
                          <div className="flex justify-between text-xs text-ink-soft"><dt>{k}</dt><dd className="tabular-nums">{v}</dd></div>
                          <Meter value={v} color={color} />
                        </div>
                      ))}
                    </dl>
                  </article>
                )
              })}
            </div>
          </section>

          {result.workbooks.length > 2 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="pair-a">Compare</label>
              <select id="pair-a" className="field !w-auto !py-1.5" value={pair[0]}
                      onChange={(e) => { const a = +e.target.value; setPair([a, Math.max(pair[1], a + 1)]) }}>
                {result.workbooks.slice(0, -1).map((w) => <option key={w.index} value={w.index}>{w.index + 1}. {w.name}</option>)}
              </select>
              <label htmlFor="pair-b">with</label>
              <select id="pair-b" className="field !w-auto !py-1.5" value={pair[1]} onChange={(e) => setPair([pair[0], +e.target.value])}>
                {result.workbooks.filter((w) => w.index > pair[0]).map((w) => <option key={w.index} value={w.index}>{w.index + 1}. {w.name}</option>)}
              </select>
            </div>
          )}

          {diff && wa && wb && (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
                <section className="sheet rounded-md p-5" aria-labelledby="vc-h">
                  <h2 id="vc-h" className="font-serif text-2xl">Verdict change</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <div className="text-center">
                      <div className="font-serif text-[44px] font-semibold leading-none text-ink-soft tabular-nums">{diff.verdict.overall.a ?? '—'}</div>
                      <div className="mt-1 text-xs font-semibold" style={{ color: famColor(diff.verdict.label.a) }}>{diff.verdict.label.a}</div>
                    </div>
                    <span aria-hidden className="text-2xl text-ink-soft">→</span>
                    <div className="text-center">
                      <div className="font-serif text-[44px] font-semibold leading-none tabular-nums">{diff.verdict.overall.b ?? '—'}</div>
                      <div className="mt-1 text-xs font-semibold" style={{ color: famColor(diff.verdict.label.b) }}>{diff.verdict.label.b}</div>
                    </div>
                    <span className="text-lg"><Delta value={diff.verdict.overall.delta} /></span>
                    {diff.verdict.label.changed && (
                      <span className="chip fam-caution rounded border border-current px-2 py-0.5 text-xs font-semibold uppercase">Verdict changed</span>
                    )}
                  </div>

                  <table className="mt-5 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-ink-soft">
                        <th className="py-1 font-normal">Dimension</th>
                        <th className="w-1/4 px-2 font-normal">{pair[0] + 1}</th>
                        <th className="w-1/4 px-2 font-normal">{pair[1] + 1}</th>
                        <th className="text-right font-normal">Δ /10</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.verdict.dimensions.map((d) => (
                        <tr key={d.key} className="border-t border-hair">
                          <td className="py-2">{d.label}</td>
                          <td className="px-2"><Meter value={d.a} color="var(--ghost)" /><span className="text-xs text-ink-soft tabular-nums">{fmt(d.a)}</span></td>
                          <td className="px-2"><Meter value={d.b} color={famColor(diff.verdict.label.b)} /><span className="text-xs text-ink-soft tabular-nums">{fmt(d.b)}</span></td>
                          <td className="text-right"><Delta value={d.delta} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h3 className="mt-5 font-serif text-lg">Why it moved</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {diff.verdict.drivers.length ? diff.verdict.drivers.map((d) => <li key={d}>{d}</li>) : <li>No dimension moved.</li>}
                  </ul>

                  <div className="bar-seal mt-6">
                    <h3 className="font-serif text-lg">Put them on trial</h3>
                    <p className="text-sm text-ink-soft">
                      The council of ghosts reads both spreadsheets, researches the company live and the Soul Binder rules on what changed and what to do next.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      {(['fast', 'deep'] as const).map((d) => (
                        <label key={d} className={`btn btn-line cursor-pointer !px-3 !py-1 ${depth === d ? 'border-seal! text-seal' : ''}`}>
                          <input type="radio" name="trial-depth" value={d} checked={depth === d} onChange={() => setDepth(d)} className="sr-only" />
                          {d === 'fast' ? 'Fast' : 'Deep'}
                        </label>
                      ))}
                      <button type="button" className="btn btn-seal" disabled={trialBusy} onClick={putOnTrial}>
                        {trialBusy ? 'Opening the case…' : 'Summon the council'}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="sheet rounded-md p-5" aria-labelledby="kn-h">
                  <h2 id="kn-h" className="font-serif text-2xl">Key numbers</h2>
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-xs text-ink-soft">
                        <th className="py-1 text-left font-normal">Metric</th>
                        <th className="text-right font-normal">{pair[0] + 1}</th>
                        <th className="text-right font-normal">{pair[1] + 1}</th>
                        <th className="text-right font-normal">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.verdict.kpis.map((k) => {
                        const points = /_(pct|pp)$/.test(k.key)
                        const ratio = k.key === 'expense_ratio'
                        return (
                          <tr key={k.key} className="border-t border-hair">
                            <td className="py-1.5">{k.label}</td>
                            <td className="text-right text-ink-soft tabular-nums">{fmt(k.a, 2)}</td>
                            <td className="text-right tabular-nums">{fmt(k.b, 2)}</td>
                            <td className="text-right">
                              {points || ratio || k.pct === null
                                ? <Delta value={k.delta} suffix={points ? ' pp' : ''} lowerIsBetter={ratio} digits={ratio ? 2 : 1} />
                                : <Delta value={k.pct} suffix="%" />}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {chart.length > 0 && (
                    <figure className="mt-5">
                      <figcaption className="text-xs text-ink-soft">Revenue and net profit per period, ₹ as in the sheets</figcaption>
                      <div className="mt-2 h-60">
                        <ResponsiveContainer>
                          <BarChart data={chart} margin={{ left: -8, right: 4 }}>
                            <CartesianGrid stroke="var(--hair)" vertical={false} />
                            <XAxis dataKey="period" tick={{ fill: 'var(--ink-soft)', fontSize: 10 }} />
                            <YAxis tick={{ fill: 'var(--ink-soft)', fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: 'var(--sheet)', border: '1px solid var(--hair)', fontSize: 12, color: 'var(--ink)' }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="revA" name={`Revenue · ${wa.name}`} fill="var(--ghost)" isAnimationActive={false} />
                            <Bar dataKey="revB" name={`Revenue · ${wb.name}`} fill="var(--go)" isAnimationActive={false} />
                            <Bar dataKey="profA" name={`Profit · ${wa.name}`} fill="color-mix(in srgb, var(--caution) 55%, transparent)" isAnimationActive={false} />
                            <Bar dataKey="profB" name={`Profit · ${wb.name}`} fill="var(--caution)" isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </figure>
                  )}
                </section>
              </div>

              <section aria-labelledby="cells-h">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="cells-h" className="font-serif text-2xl">Changed cells · {diff.cells.total_changed}</h2>
                  <span className="text-xs text-ink-soft">
                    Rows matched by {diff.cells.paired_by === 'label' ? 'label (same periods)' : 'position (Q1 vs Q1 across years)'}
                  </span>
                </div>
                {structural.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                    {structural.map((t) => <li key={t} className="fam-caution rounded border border-current px-1.5 py-0.5">{t}</li>)}
                  </ul>
                )}
                <div className="table-wrap max-h-[460px] overflow-y-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="sticky top-0 bg-sheet">
                      <tr className="text-xs text-ink-soft">
                        <th className="px-3 py-2 text-left font-normal">Sheet</th>
                        <th className="px-3 text-left font-normal">Row</th>
                        <th className="px-3 text-left font-normal">Column</th>
                        <th className="px-3 text-right font-normal">{wa.name}</th>
                        <th className="px-3 text-right font-normal">{wb.name}</th>
                        <th className="px-3 text-right font-normal">Δ</th>
                        <th className="px-3 text-right font-normal">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.cells.changes.map((c, i) => (
                        <tr key={i} className="border-t border-hair">
                          <td className="px-3 py-1.5 text-ink-soft">{c.sheet}</td>
                          <td className="px-3">{c.row}</td>
                          <td className="px-3 text-ink-soft">{c.column}</td>
                          <td className="max-w-[240px] truncate px-3 text-right text-ink-soft tabular-nums" title={String(c.a ?? '')}>{fmt(c.a, 2)}</td>
                          <td className="max-w-[240px] truncate px-3 text-right tabular-nums" title={String(c.b ?? '')}>{fmt(c.b, 2)}</td>
                          <td className="px-3 text-right"><Delta value={c.delta} /></td>
                          <td className="px-3 text-right">{c.pct !== null ? <Delta value={c.pct} suffix="%" /> : <span className="text-ink-soft">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  )
}
