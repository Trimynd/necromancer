import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link } from 'wouter';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FileSpreadsheet, FolderUp, GitCompareArrows, Loader2,
  Skull, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const MAX_FILES = 6;

type Verdict = {
  overall: number | null; label: string; mode: string | null; headline: string;
  dimensions: Record<string, number>; kpis: Record<string, number>;
};
type Workbook = {
  index: number; name: string; document_id: string; verdict: Verdict;
  financials: { sheet: string | null; periods: string[]; series: Record<string, (number | null)[]>; metrics: Record<string, string> };
};
type Cell = { sheet: string; row: string; column: string; a: unknown; b: unknown; delta: number | null; pct: number | null };
type Diff = {
  from: number; to: number;
  cells: { changes: Cell[]; total_changed: number; paired_by: 'label' | 'position'; added_rows: string[]; removed_rows: string[];
    added_columns: string[]; removed_columns: string[] };
  verdict: {
    overall: { a: number | null; b: number | null; delta: number | null };
    label: { a: string; b: string; changed: boolean };
    dimensions: { key: string; label: string; a: number | null; b: number | null; delta: number | null }[];
    kpis: { key: string; label: string; a: number | null; b: number | null; delta: number | null; pct: number | null }[];
    drivers: string[];
  };
};
type Result = { workbooks: Workbook[]; diffs: Record<string, Diff> };

const SAMPLES: { title: string; note: string; files: string[] }[] = [
  { title: 'Zomato FY23 → FY24', note: 'Loss to first profit', files: ['zomato_fy2023.xlsx', 'zomato_fy2024.xlsx'] },
  { title: 'Paytm FY24 → FY25', note: 'After the RBI action', files: ['paytm_fy2024.xlsx', 'paytm_fy2025.xlsx'] },
  { title: 'Nykaa FY25 vs what-if', note: 'Same rows, expenses +3%', files: ['nykaa_fy2025.xlsx', 'nykaa_fy2025_whatif.xlsx'] },
  { title: 'All six workbooks', note: 'Verdict for each', files: ['zomato_fy2023.xlsx', 'zomato_fy2024.xlsx', 'paytm_fy2024.xlsx', 'paytm_fy2025.xlsx', 'nykaa_fy2025.xlsx', 'nykaa_fy2025_whatif.xlsx'] },
];

const LABEL_COLOR: Record<string, string> = {
  SCALE: '#19b99c', 'GROW WITH CARE': '#7cc4a4', RECOVERABLE: '#d9a441', CRITICAL: '#e0605a',
};

const fmt = (v: unknown, digits = 1) =>
  v === null || v === undefined ? '—' : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: digits }) : String(v);

function Delta({ value, suffix = '', lowerIsBetter = false, digits = 1 }: { value: number | null; suffix?: string; lowerIsBetter?: boolean; digits?: number }) {
  if (value === null || value === undefined || value === 0) return <span className="text-[#5d7479]">{value === 0 ? '0' : '—'}</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono ${up !== lowerIsBetter ? 'text-[#19b99c]' : 'text-[#e0605a]'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{up ? '+' : ''}{fmt(value, digits)}{suffix}
    </span>
  );
}

function ScoreBar({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="h-1.5 w-full bg-[#14232a]">
      <div className="h-full transition-all" style={{ width: `${(value ?? 0) * 10}%`, background: color }} />
    </div>
  );
}

export default function Compare() {
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [pair, setPair] = useState<[number, number]>([0, 1]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (items: FileList | File[]) => {
    const ok = Array.from(items).filter(f => /\.(xlsx|xlsm|csv)$/i.test(f.name));
    if (!ok.length) { setError('Only Excel (.xlsx) or CSV files can be compared.'); return; }
    setFiles(prev => [...prev, ...ok].slice(0, MAX_FILES));
    setError('');
    setResult(null);
  };

  const move = (i: number, dir: -1 | 1) => setFiles(prev => {
    const next = [...prev];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    return next;
  });

  const loadSample = async (names: string[]) => {
    setError('');
    try {
      const loaded = await Promise.all(names.map(async n => {
        const r = await fetch(`${import.meta.env.BASE_URL}samples/${n}`);
        if (!r.ok) throw new Error(`Sample ${n} not found`);
        return new File([await r.blob()], n);
      }));
      setFiles(loaded);
      setResult(null);
      await run(loaded);
    } catch (e) { setError((e as Error).message); }
  };

  const run = async (list = files) => {
    if (list.length < 2) { setError('Add at least two spreadsheets, oldest first.'); return; }
    setBusy(true); setError('');
    try {
      const body = new FormData();
      list.forEach(f => body.append('files', f));
      const r = await fetch(`${API}/api/compare`, { method: 'POST', body });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Compare failed (${r.status})`);
      setResult(data as Result);
      setPair([0, 1]);
    } catch (e) {
      setError(e instanceof TypeError ? 'Could not reach the backend. Is it running on port 8000?' : (e as Error).message);
    } finally { setBusy(false); }
  };

  // /compare?sample=1 opens straight into a sample comparison (handy for demos)
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('sample'));
    if (SAMPLES[n - 1]) loadSample(SAMPLES[n - 1].files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); };

  const diff = result?.diffs[`${pair[0]}-${pair[1]}`];
  const wa = result?.workbooks[pair[0]];
  const wb = result?.workbooks[pair[1]];

  const chart = useMemo(() => {
    if (!wa || !wb) return [];
    const n = Math.max(wa.financials.periods.length, wb.financials.periods.length);
    return Array.from({ length: n }, (_, i) => ({
      period: [wa.financials.periods[i], wb.financials.periods[i]].filter(Boolean).join(' / '),
      [`Revenue · ${wa.name}`]: wa.financials.series.revenue?.[i] ?? null,
      [`Revenue · ${wb.name}`]: wb.financials.series.revenue?.[i] ?? null,
      [`Profit · ${wa.name}`]: wa.financials.series.net_profit?.[i] ?? null,
      [`Profit · ${wb.name}`]: wb.financials.series.net_profit?.[i] ?? null,
    }));
  }, [wa, wb]);

  return (
    <main className="app-shell pb-28">
      <header className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between border-b border-[#1c2b34] px-4 py-3 sm:px-8 md:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center border border-[#23564f] bg-[#0d201e] text-[#29c9a9]"><Skull size={18} strokeWidth={1.7} /></span>
          <span>
            <span className="font-display block text-[13px] font-extrabold tracking-[.08em] text-[#e6f4f1]">PROJECT NECROMANCER</span>
            <span className="font-mono block text-[8px] tracking-[.14em] text-[#78929e]">LEDGER COMPARISON</span>
          </span>
        </Link>
        <Link href="/" className="button-quiet flex items-center gap-1.5 px-3 py-1.5 text-[10px]"><ArrowLeft size={13} /> Chamber</Link>
      </header>

      <section className="relative z-10 mx-auto max-w-[1360px] px-5 pt-6 md:px-10 md:pt-10">
        <div className="mb-6 border-b border-[#1c2b34] pb-4">
          <div className="eyebrow flex items-center gap-2"><GitCompareArrows size={12} /> Compare ledgers</div>
          <h2 className="font-display mt-1 text-2xl font-bold text-[#e6f4f1] sm:text-3xl">How did the numbers move the verdict?</h2>
          <p className="mt-1 max-w-[720px] text-xs text-[#82979a]">
            Upload 2–6 Excel or CSV files, oldest first. Each one gets a verdict worked out in code from its own numbers, and each
            later file is also judged against the one before it. Pick any two to see which cells changed and how that changed the verdict.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="surface p-5">
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer border border-dashed px-4 py-7 text-center transition ${drag ? 'border-[#19b99c] bg-[#0c1d1b]' : 'border-[#2a4045] bg-[#070d10] hover:border-[#238c7c]'}`}
            >
              <FolderUp size={22} className="mx-auto mb-2 text-[#19b99c]" />
              <div className="text-xs text-[#cfe2de]">Drop spreadsheets here or click to choose</div>
              <div className="mt-1 font-mono text-[9px] text-[#5d7479]">XLSX · CSV · up to {MAX_FILES} files · 5 MB each</div>
              <input ref={inputRef} type="file" multiple accept=".xlsx,.xlsm,.csv" className="hidden"
                     onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            {files.length > 0 && (
              <ol className="mt-4 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 border border-[#1f3238] bg-[#0a1316] px-3 py-2 text-xs text-[#cfe2de]">
                    <span className="font-mono w-5 text-[10px] text-[#5d7479]">{i + 1}.</span>
                    <FileSpreadsheet size={14} className="text-[#19b99c]" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-[#6f888c] disabled:opacity-30"><ArrowUp size={12} /></button>
                    <button aria-label="Move down" disabled={i === files.length - 1} onClick={() => move(i, 1)} className="p-1 text-[#6f888c] disabled:opacity-30"><ArrowDown size={12} /></button>
                    <button aria-label="Remove" onClick={() => { setFiles(files.filter((_, k) => k !== i)); setResult(null); }} className="p-1 text-[#6f888c] hover:text-[#e0605a]"><X size={12} /></button>
                  </li>
                ))}
              </ol>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={() => run()} disabled={busy || files.length < 2}
                      className="button-primary flex items-center gap-2 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider disabled:opacity-40">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <GitCompareArrows size={14} />} Compare
              </button>
              {error && <span className="text-xs text-[#e0605a]">{error}</span>}
            </div>
          </div>

          <aside className="surface p-5">
            <div className="font-mono mb-3 text-[9px] uppercase tracking-wider text-[#698884]">Sample ledgers · public quarterly results</div>
            <div className="space-y-2">
              {SAMPLES.map(s => (
                <button key={s.title} onClick={() => loadSample(s.files)} disabled={busy}
                        className="flex w-full items-center justify-between border border-[#1f3238] bg-[#0a1316] px-3 py-2.5 text-left hover:border-[#238c7c] disabled:opacity-40">
                  <span>
                    <span className="block text-xs text-[#d9e8e5]">{s.title}</span>
                    <span className="font-mono block text-[9px] text-[#5d7479]">{s.note}</span>
                  </span>
                  <ArrowRight size={13} className="text-[#19b99c]" />
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
              {SAMPLES[3].files.map(n => (
                <a key={n} href={`${import.meta.env.BASE_URL}samples/${n}`} download className="font-mono text-[9px] text-[#4f8f83] underline">{n}</a>
              ))}
            </div>
          </aside>
        </div>

        {result && (
          <>
            <div className="mt-8 grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))` }}>
              {result.workbooks.map(w => {
                const color = LABEL_COLOR[w.verdict.label] ?? '#78929e';
                const selected = pair.includes(w.index);
                return (
                  <div key={w.index} className={`surface p-4 ${selected ? 'ring-1 ring-[#238c7c]' : ''}`}>
                    <div className="font-mono truncate text-[9px] text-[#698884]">{w.index + 1}. {w.name}</div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="font-display text-3xl font-extrabold text-[#e6f4f1]">{w.verdict.overall ?? '—'}</span>
                      <span className="font-mono text-[10px] font-bold" style={{ color }}>{w.verdict.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-5 text-[#8da5a8]">{w.verdict.headline}</p>
                    <div className="mt-3 space-y-1.5">
                      {Object.entries(w.verdict.dimensions).map(([k, v]) => (
                        <div key={k}>
                          <div className="flex justify-between font-mono text-[9px] text-[#6f888c]"><span>{k}</span><span>{v}</span></div>
                          <ScoreBar value={v} color={color} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {result.workbooks.length > 2 && (
              <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-[#8da5a8]">
                Compare
                <select value={pair[0]} onChange={e => { const a = +e.target.value; setPair([a, Math.max(pair[1], a + 1)]); }}
                        className="border border-[#23383e] bg-[#070d10] px-2 py-1 text-[#d9e8e5]">
                  {result.workbooks.slice(0, -1).map(w => <option key={w.index} value={w.index}>{w.index + 1}. {w.name}</option>)}
                </select>
                with
                <select value={pair[1]} onChange={e => setPair([pair[0], +e.target.value])}
                        className="border border-[#23383e] bg-[#070d10] px-2 py-1 text-[#d9e8e5]">
                  {result.workbooks.filter(w => w.index > pair[0]).map(w => <option key={w.index} value={w.index}>{w.index + 1}. {w.name}</option>)}
                </select>
              </div>
            )}

            {diff && wa && wb && (
              <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
                <div className="surface p-5">
                  <div className="eyebrow mb-3">Verdict change</div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-center">
                      <div className="font-display text-4xl font-extrabold text-[#cfe2de]">{diff.verdict.overall.a ?? '—'}</div>
                      <div className="font-mono text-[10px]" style={{ color: LABEL_COLOR[diff.verdict.label.a] }}>{diff.verdict.label.a}</div>
                    </div>
                    <ArrowRight className="text-[#4f6a6f]" />
                    <div className="text-center">
                      <div className="font-display text-4xl font-extrabold text-[#e6f4f1]">{diff.verdict.overall.b ?? '—'}</div>
                      <div className="font-mono text-[10px]" style={{ color: LABEL_COLOR[diff.verdict.label.b] }}>{diff.verdict.label.b}</div>
                    </div>
                    <div className="ml-2 text-lg"><Delta value={diff.verdict.overall.delta} /></div>
                    {diff.verdict.label.changed && (
                      <span className="border border-[#5a4a24] bg-[#1c1709] px-2 py-1 font-mono text-[9px] uppercase text-[#d9a441]">Verdict changed</span>
                    )}
                  </div>

                  <table className="mt-5 w-full text-xs">
                    <thead><tr className="font-mono text-[9px] uppercase text-[#5d7479]">
                      <th className="py-1 text-left">Dimension</th><th className="w-1/4">{pair[0] + 1}</th><th className="w-1/4">{pair[1] + 1}</th><th className="text-right">Δ /10</th>
                    </tr></thead>
                    <tbody>
                      {diff.verdict.dimensions.map(d => (
                        <tr key={d.key} className="border-t border-[#172830]">
                          <td className="py-2 text-[#cfe2de]">{d.label}</td>
                          <td className="px-2"><ScoreBar value={d.a} color="#4f6a6f" /><span className="font-mono text-[9px] text-[#6f888c]">{fmt(d.a)}</span></td>
                          <td className="px-2"><ScoreBar value={d.b} color="#19b99c" /><span className="font-mono text-[9px] text-[#6f888c]">{fmt(d.b)}</span></td>
                          <td className="text-right"><Delta value={d.delta} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="eyebrow mb-2 mt-5">Why it moved</div>
                  <ul className="space-y-1.5 text-xs leading-5 text-[#a9bfc0]">
                    {diff.verdict.drivers.length ? diff.verdict.drivers.map(d => <li key={d}>• {d}</li>) : <li>No dimension moved.</li>}
                  </ul>
                </div>

                <div className="surface p-5">
                  <div className="eyebrow mb-3">Key numbers</div>
                  <table className="w-full text-xs">
                    <thead><tr className="font-mono text-[9px] uppercase text-[#5d7479]">
                      <th className="py-1 text-left">Metric</th><th className="text-right">{pair[0] + 1}</th><th className="text-right">{pair[1] + 1}</th><th className="text-right">Change</th>
                    </tr></thead>
                    <tbody>
                      {diff.verdict.kpis.map(k => (
                        <tr key={k.key} className="border-t border-[#172830]">
                          <td className="py-1.5 text-[#cfe2de]">{k.label}</td>
                          <td className="text-right font-mono text-[#8da5a8]">{fmt(k.a, 2)}</td>
                          <td className="text-right font-mono text-[#d9e8e5]">{fmt(k.b, 2)}</td>
                          <td className="text-right">{/_(pct|pp)$|ratio/.test(k.key) || k.pct === null
                            ? <Delta value={k.delta} suffix={/_(pct|pp)$/.test(k.key) ? ' pp' : ''} lowerIsBetter={k.key === 'expense_ratio'} digits={k.key === 'expense_ratio' ? 2 : 1} />
                            : <Delta value={k.pct} suffix="%" />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {chart.length > 0 && (
                    <div className="mt-5 h-56">
                      <ResponsiveContainer>
                        <BarChart data={chart} margin={{ left: -10, right: 4 }}>
                          <CartesianGrid stroke="#172830" vertical={false} />
                          <XAxis dataKey="period" tick={{ fill: '#6f888c', fontSize: 9 }} />
                          <YAxis tick={{ fill: '#6f888c', fontSize: 9 }} />
                          <Tooltip contentStyle={{ background: '#0a1316', border: '1px solid #23383e', fontSize: 11 }} />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                          <Bar dataKey={`Revenue · ${wa.name}`} fill="#3d5a60" isAnimationActive={false} />
                          <Bar dataKey={`Revenue · ${wb.name}`} fill="#19b99c" isAnimationActive={false} />
                          <Bar dataKey={`Profit · ${wa.name}`} fill="#7a5a2c" isAnimationActive={false} />
                          <Bar dataKey={`Profit · ${wb.name}`} fill="#d9a441" isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="surface p-5 lg:col-span-2">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="eyebrow">Changed cells · {diff.cells.total_changed}</div>
                    <span className="font-mono text-[9px] text-[#5d7479]">
                      rows matched by {diff.cells.paired_by === 'label' ? 'label (same periods)' : 'position (Q1 vs Q1 across years)'}
                    </span>
                  </div>
                  {[...diff.cells.added_rows.map(r => `+ row ${r}`), ...diff.cells.removed_rows.map(r => `− row ${r}`),
                    ...diff.cells.added_columns.map(c => `+ column ${c}`), ...diff.cells.removed_columns.map(c => `− column ${c}`)].length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2 font-mono text-[9px] text-[#d9a441]">
                      {[...diff.cells.added_rows.map(r => `+ row ${r}`), ...diff.cells.removed_rows.map(r => `− row ${r}`),
                        ...diff.cells.added_columns.map(c => `+ column ${c}`), ...diff.cells.removed_columns.map(c => `− column ${c}`)]
                        .map(t => <span key={t} className="border border-[#3a3220] px-1.5 py-0.5">{t}</span>)}
                    </div>
                  )}
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead className="sticky top-0 bg-[#0b1417]"><tr className="font-mono text-[9px] uppercase text-[#5d7479]">
                        <th className="py-1.5 text-left">Sheet</th><th className="text-left">Row</th><th className="text-left">Column</th>
                        <th className="text-right">{wa.name}</th><th className="text-right">{wb.name}</th><th className="text-right">Δ</th><th className="text-right">%</th>
                      </tr></thead>
                      <tbody>
                        {diff.cells.changes.map((c, i) => (
                          <tr key={i} className="border-t border-[#172830]">
                            <td className="py-1.5 text-[#6f888c]">{c.sheet}</td>
                            <td className="text-[#cfe2de]">{c.row}</td>
                            <td className="text-[#a9bfc0]">{c.column}</td>
                            <td className="max-w-[220px] truncate text-right font-mono text-[#8da5a8]" title={String(c.a ?? '')}>{fmt(c.a, 2)}</td>
                            <td className="max-w-[220px] truncate text-right font-mono text-[#e6f4f1]" title={String(c.b ?? '')}>{fmt(c.b, 2)}</td>
                            <td className="text-right"><Delta value={c.delta} /></td>
                            <td className="text-right">{c.pct !== null ? <Delta value={c.pct} suffix="%" /> : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
