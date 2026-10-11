// Google Sheet re-analysis: "what changed since last time" and the "I updated my sheet" button. No recharts.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DOC_ICON, isMock, loadRecent, refreshData, refreshQuestion, rootOf, saveRecent, type ColChange, type Doc, type SheetChange } from './lib'

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
            {sheets.length > 1 && <h3 className="font-serif text-lg">{s.name}</h3>}
            <p className="text-sm text-ink-soft">
              Rows: {s.rows_before} → {s.rows_after}
              {s.rows_after > s.rows_before && <span className="fam-go"> (+{s.rows_after - s.rows_before} added)</span>}
              {s.added_columns.length > 0 && <> · New: <span className="fam-go">{s.added_columns.map(pretty).join(', ')}</span></>}
              {s.removed_columns.length > 0 && <> · Removed: <span className="fam-stop">{s.removed_columns.map(pretty).join(', ')}</span></>}
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
              {s.columns.map((c) => <Row key={c.column} c={c} />)}
            </ul>
          </div>
        ))}
        <p className="mt-2 text-xs text-ink-soft">Worked out by code from your sheet. The council's verdict explains what it means for you.</p>
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
