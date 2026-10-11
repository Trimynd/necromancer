// Google Sheet re-analysis: "what changed since last time" and the "I updated my sheet" button. No recharts.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DOC_ICON, isMock, loadRecent, refreshData, refreshQuestion, rootOf, saveRecent, updateData, updateQuestion, type ColChange, type Doc, type SheetChange } from './lib'

const pretty = (c: string) => c.replace(/_/g, ' ')
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const fmt = (n: number | null) => (n == null ? '–' : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }))
/** Columns where going up is bad news (same rule as "Your numbers"). */
export const UP_IS_BAD = /cost|expense|churn|return|refund|complaint|debt|loss/i
const HEADLINE = /revenue|sales|income|profit|orders|customers/i
const TREND_WORD = { up: 'rising', down: 'falling', flat: 'flat' } as const

/** One plain line, built by code: "Revenue up 80% since your last analysis; 1 new row." */
export function changeSummary(sheets: SheetChange[]) {
  const cols = sheets.flatMap((s) => s.columns).filter((c) => c.change_pct != null && c.change_pct !== 0)
  const main = cols.find((c) => HEADLINE.test(c.column)) ?? [...cols].sort((a, b) => Math.abs(b.change_pct!) - Math.abs(a.change_pct!))[0]
  const parts: string[] = []
  if (main) parts.push(`${cap(pretty(main.column))} ${main.change_pct! > 0 ? 'up' : 'down'} ${Math.abs(main.change_pct!)}% since your last analysis`)
  const added = sheets.reduce((n, s) => n + Math.max(0, s.rows_after - s.rows_before), 0)
  if (added) parts.push(`${added} new row${added === 1 ? '' : 's'}`)
  const newCols = sheets.flatMap((s) => s.added_columns)
  if (newCols.length) parts.push(`new column${newCols.length === 1 ? '' : 's'}: ${newCols.map(pretty).join(', ')}`)
  return parts.length ? parts.join('; ') + '.' : 'Your sheet changed, but none of the numbers moved much.'
}

function Row({ c }: { c: ColChange }) {
  const pct = c.change_pct
  const good = pct == null || pct === 0 ? undefined : (pct > 0) !== UP_IS_BAD.test(c.column)
  const flip = c.trend_before && c.trend_after && c.trend_before !== c.trend_after
  return (
    <li className="rounded-md border border-hair px-3 py-2">
      <p className="truncate text-xs text-ink-soft" title={c.column}>{pretty(c.column)}</p>
      <p className="font-serif text-[20px] leading-tight">
        <span className="text-ink-soft">{fmt(c.before)}</span> <span aria-hidden>→</span><span className="sr-only">to</span> {fmt(c.after)}
      </p>
      <p className={`text-sm ${good == null ? 'text-ink-soft' : good ? 'fam-go' : 'fam-stop'}`}>
        {pct == null ? 'new' : `${pct > 0 ? '▲' : pct < 0 ? '▼' : '■'} ${Math.abs(pct)}%`}
      </p>
      {flip && (
        <p className={`stamp-chip mt-1 !text-xs ${c.trend_after === 'up' !== UP_IS_BAD.test(c.column) ? 'fam-go' : 'fam-stop'}`}>
          was {TREND_WORD[c.trend_before!]} → now {TREND_WORD[c.trend_after!]}
        </p>
      )}
    </li>
  )
}

/** "What changed in your numbers (v1 → v2)": per column before → after, ▲/▼ %, trend flips, rows and columns. */
export function DataChanged({ sheets }: { sheets: SheetChange[] }) {
  if (!sheets.length) return null
  const v0 = Math.min(...sheets.map((s) => s.version_before)), v1 = Math.max(...sheets.map((s) => s.version_after))
  return (
    <section id="data-changed" className="entry">
      <div className="rounded-md border-2 border-seal/60 bg-seal/5 p-4">
        <p className="eyebrow">Data update v{v1}</p>
        <h2 className="mt-1 font-serif text-[26px]">What changed in your numbers (v{v0} → v{v1})</h2>
        <p className="mt-1 text-lg font-medium">{changeSummary(sheets)}</p>
        {sheets.map((s) => (
          <div key={s.name} className="mt-3">
            {(sheets.length > 1 || (s.previous_name && s.previous_name !== s.name)) && (
              <h3 className="font-serif text-lg">{s.previous_name && s.previous_name !== s.name ? <>{s.previous_name} <span aria-hidden>→</span> {s.name}</> : s.name}</h3>
            )}
            {s.verdict && <VerdictMove v={s.verdict} />}
            <p className="text-sm text-ink-soft">
              Rows: {s.rows_before} → {s.rows_after}
              {s.rows_after > s.rows_before && <span className="fam-go"> (+{s.rows_after - s.rows_before} added)</span>}
              {s.added_columns.length > 0 && <> · New: <span className="fam-go">{s.added_columns.map(pretty).join(', ')}</span></>}
              {s.removed_columns.length > 0 && <> · Removed: <span className="fam-stop">{s.removed_columns.map(pretty).join(', ')}</span></>}
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              {s.columns.map((c) => <Row key={c.column} c={c} />)}
            </ul>
            {s.cells && s.cells.total_changed > 0 && <CellTable cells={s.cells} />}
          </div>
        ))}
        <p className="mt-2 text-xs text-ink-soft">Worked out by code from your sheet. The council's verdict explains what it means for you.</p>
      </div>
    </section>
  )
}

const LEDGER_FAM: Record<string, string> = { SCALE: 'go', 'GROW WITH CARE': 'go', RECOVERABLE: 'caution', CRITICAL: 'stop' }

/** The code-computed health verdict before -> after, with the reasons (same engine as the Compare page). */
function VerdictMove({ v }: { v: NonNullable<SheetChange['verdict']> }) {
  const d = v.overall.delta
  return (
    <div className="mt-2 rounded-md bg-sheet p-3">
      <p className="text-xs uppercase tracking-wide text-ink-soft">Health score by code</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-serif text-[28px] leading-none text-ink-soft tabular-nums">{v.overall.a ?? '–'}</span>
        <span className={`text-xs font-semibold fam-${LEDGER_FAM[v.label.a] ?? 'caution'}`}>{v.label.a}</span>
        <span aria-hidden>→</span><span className="sr-only">to</span>
        <span className="font-serif text-[28px] leading-none tabular-nums">{v.overall.b ?? '–'}</span>
        <span className={`text-xs font-semibold fam-${LEDGER_FAM[v.label.b] ?? 'caution'}`}>{v.label.b}</span>
        {d != null && d !== 0 && <span className={d > 0 ? 'fam-go' : 'fam-stop'}>{d > 0 ? '▲ +' : '▼ '}{d}</span>}
        {v.label.changed && <span className="stamp-chip fam-caution !text-xs">verdict changed</span>}
      </p>
      {v.drivers.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
          {v.drivers.slice(0, 4).map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </div>
  )
}

/** Every changed cell (row × column, old → new), collapsed by default. */
function CellTable({ cells }: { cells: NonNullable<SheetChange['cells']> }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm">
        {cells.total_changed} changed cell{cells.total_changed === 1 ? '' : 's'}
        <span className="text-ink-soft"> · rows matched by {cells.paired_by === 'label' ? 'label' : 'position (Q1 vs Q1)'}</span>
      </summary>
      <div className="table-wrap max-h-80 overflow-y-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="sticky top-0 bg-sheet">
            <tr className="text-xs text-ink-soft">
              <th className="px-3 py-1.5 text-left font-normal">Row</th><th className="px-3 text-left font-normal">Column</th>
              <th className="px-3 text-right font-normal">Before</th><th className="px-3 text-right font-normal">After</th>
              <th className="px-3 text-right font-normal">Change</th>
            </tr>
          </thead>
          <tbody>
            {cells.changes.map((c, i) => {
              const good = c.delta == null || c.delta === 0 ? undefined : (c.delta > 0) !== UP_IS_BAD.test(c.column)
              return (
                <tr key={i} className="border-t border-hair">
                  <td className="px-3 py-1">{c.row}</td>
                  <td className="px-3 text-ink-soft">{pretty(c.column)}</td>
                  <td className="px-3 text-right text-ink-soft tabular-nums">{typeof c.a === 'number' ? fmt(c.a) : String(c.a ?? '–')}</td>
                  <td className="px-3 text-right tabular-nums">{typeof c.b === 'number' ? fmt(c.b) : String(c.b ?? '–')}</td>
                  <td className={`px-3 text-right tabular-nums ${good == null ? 'text-ink-soft' : good ? 'fam-go' : 'fam-stop'}`}>
                    {c.pct != null ? `${c.pct > 0 ? '+' : ''}${c.pct}%` : c.delta != null ? `${c.delta > 0 ? '+' : ''}${fmt(c.delta)}` : 'edited'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/** "Upload a new version" for any document in the case: next month's Excel, a corrected CSV, a what-if.
 *  The backend diffs it against the old file by code, then the council re-judges in a follow-up turn. */
export function UpdateData({ id, docs }: { id: string; docs: Doc[] }) {
  const nav = useNavigate()
  const old = loadRecent().find((r) => r.id === id)
  const [depth, setDepth] = useState<'fast' | 'deep'>('fast')
  const [busy, setBusy] = useState<string>()
  const [msg, setMsg] = useState<{ text: string; err: boolean }>()
  const go = async (doc: Doc, file: File) => {
    setBusy(doc.id)
    setMsg(undefined)
    try {
      const newId = await updateData(id, doc.id, file, { depth, strict: old?.strict })
      const v = (doc.version ?? 1) + 1
      saveRecent({
        id: newId, title: `Data update v${v}: ${file.name}`, text: updateQuestion(doc.name, file.name, v), depth, at: Date.now(),
        strict: old?.strict, stage: old?.stage, parent: id, root: rootOf(id),
      })
      nav(`/case/${newId}${isMock() ? '?mock=1' : ''}`)
    } catch (e) {
      const status = (e as { status?: number }).status
      setMsg(status === 409 ? { text: 'That file has the same numbers as the one already in this case.', err: false }
        : { text: e instanceof Error ? e.message : String(e), err: true })
      setBusy(undefined)
    }
  }
  return (
    <section id="update-data" className="entry no-print">
      <div className="rounded-md border border-hair p-4">
        <h2 className="font-serif text-xl">Update your data</h2>
        <p className="text-sm text-ink-soft">
          Got a newer file (next quarter's Excel, corrected numbers, a what-if)? Choose it below: you'll see exactly what changed,
          how it moves the verdict, and the council re-judges with the new numbers.
        </p>
        <fieldset className="mt-2 flex items-center gap-2 text-sm">
          <legend className="sr-only">Depth</legend>
          {(['fast', 'deep'] as const).map((d) => (
            <label key={d} className={`btn btn-line cursor-pointer !px-3 !py-1 ${depth === d ? 'border-seal! text-seal' : ''}`}>
              <input type="radio" name="update-depth" value={d} checked={depth === d} onChange={() => setDepth(d)} className="sr-only" />
              {d === 'fast' ? 'Fast' : 'Deep'}
            </label>
          ))}
        </fieldset>
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span aria-hidden>{DOC_ICON[d.kind] ?? '📄'}</span>
              <span className="min-w-0 truncate font-medium">{d.name}</span>
              {!!d.version && d.version > 1 && <span className="text-xs text-ink-soft">v{d.version}</span>}
              <label className={`btn btn-line cursor-pointer !px-3 !py-1 focus-within:outline-2 focus-within:outline-seal ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                {busy === d.id ? 'Reading the new file…' : 'Choose new version'}
                <input
                  type="file" className="sr-only" accept=".xlsx,.xlsm,.csv,.pdf,.docx,.txt,.md" disabled={!!busy}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) go(d, f) }}
                />
              </label>
            </li>
          ))}
        </ul>
        {msg && <p role={msg.err ? 'alert' : 'status'} className={`mt-2 text-sm ${msg.err ? 'fam-stop' : 'text-ink-soft'}`}>{msg.text}</p>}
      </div>
    </section>
  )
}

/** "Your Google Sheet · version N" with "I updated my sheet — re-analyse". */
export function SheetRefresh({ id, sheets }: { id: string; sheets: Doc[] }) {
  const nav = useNavigate()
  const old = loadRecent().find((r) => r.id === id)
  const [depth, setDepth] = useState<'fast' | 'deep'>('fast')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err: boolean }>()
  const v = Math.max(...sheets.map((d) => d.version ?? 1))
  const go = async () => {
    setBusy(true)
    setMsg(undefined)
    try {
      const newId = await refreshData(id, { depth, strict: old?.strict })
      const text = refreshQuestion(v + 1)
      saveRecent({ id: newId, title: `Data update v${v + 1}`, text, depth, at: Date.now(), strict: old?.strict, stage: old?.stage,
        document_ids: old?.document_ids, parent: id, root: rootOf(id) })
      nav(`/case/${newId}${isMock() ? '?mock=1' : ''}`)
    } catch (e) {
      const status = (e as { status?: number }).status
      setMsg(status === 409 ? { text: 'No changes found since the last analysis. Edit your sheet, then try again.', err: false }
        : { text: e instanceof Error ? e.message : String(e), err: true })
      setBusy(false)
    }
  }
  return (
    <section id="sheet-refresh" className="entry no-print">
      <div className="rounded-md border border-hair p-4">
        <h2 className="font-serif text-xl"><span aria-hidden>{DOC_ICON.sheet} </span>Your Google Sheet · version {v}</h2>
        <p className="text-sm text-ink-soft">{sheets.map((d) => d.name).join(', ')}. Changed your numbers since? The council re-reads the sheet and tells you what that changes.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <fieldset className="flex items-center gap-2 text-sm">
            <legend className="sr-only">Depth</legend>
            {(['fast', 'deep'] as const).map((d) => (
              <label key={d} className={`btn btn-line cursor-pointer !px-3 !py-1 ${depth === d ? 'border-seal! text-seal' : ''}`}>
                <input type="radio" name="refresh-depth" value={d} checked={depth === d} onChange={() => setDepth(d)} className="sr-only" />
                {d === 'fast' ? 'Fast' : 'Deep'}
              </label>
            ))}
          </fieldset>
          <button className="btn btn-seal" onClick={go} disabled={busy}>{busy ? 'Re-reading your sheet…' : 'I updated my sheet — re-analyse'}</button>
        </div>
        {msg && <p role={msg.err ? 'alert' : 'status'} className={`mt-2 text-sm ${msg.err ? 'fam-stop' : 'text-ink-soft'}`}>{msg.text}</p>}
      </div>
    </section>
  )
}
