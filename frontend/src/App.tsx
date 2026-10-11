import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { connectSheet, DOC_ICON, docLabel, familyOf, isMock, kindOf, loadRecent, mockQ, saveRecent, startCase, uploadDocuments, type Doc, type Recent, type Stage as Lower } from './lib'
import { MOCK_SHEET, MOCK_TEXT } from './mock'

export function Shell({ children }: { children: ReactNode }) {
  // Dark is the default look; light is opt-in.
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark')
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch { /* ignore */ }
    setTheme(next)
  }
  return (
    <div className="min-h-screen">
      <header className="mx-auto mb-4 flex max-w-6xl items-center justify-between border-b border-hair px-4 py-3">
        <Link to={isMock() ? '/?mock=1' : '/'} className="flex items-center gap-2.5">
          <span className="logo-box" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12.5 17-.5-1-.5 1h1z" /><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z" />
              <circle cx="15" cy="12" r="1" /><circle cx="9" cy="12" r="1" />
            </svg>
          </span>
          <span>
            <span className="block font-serif text-[13px] font-extrabold tracking-[.08em]">PROJECT NECROMANCER</span>
            <span className="block font-mono text-[9px] tracking-[.14em] text-ink-soft">FROM IDEA TO AFTERLIFE</span>
          </span>
        </Link>
        <button onClick={toggle} className="btn btn-line !px-3 !py-1.5 font-mono text-[11px] uppercase tracking-wider" aria-label="Toggle light or dark theme">
          {theme === 'light' ? '☾ Dark' : '☀ Light'}
        </button>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
    </div>
  )
}

// Where the business is on its lifeline. Guides the wording only; the router reads the situation itself.
type Stage = 'Launch' | 'Grow' | 'Rescue' | 'Revive'
const STAGES: { name: Stage; glyph: string; desc: string; color: string; placeholder: string }[] = [
  { name: 'Launch', glyph: '✦', desc: 'An idea waiting for its first proof.', color: '#10b981',
    placeholder: 'I want to start a tiffin service in Pune for college students at ₹2500/month…' },
  { name: 'Grow', glyph: '↗', desc: 'A living company reaching for more.', color: '#3b82f6',
    placeholder: 'My coaching academy is profitable with 4,200 students. Should we open in two new cities?' },
  { name: 'Rescue', glyph: '♥', desc: 'Sales or cash running low.', color: '#f59e0b',
    placeholder: "My company sells mobile phones. Sales used to be good but they've halved since March…" },
  { name: 'Revive', glyph: '☠', desc: 'Shut down, with something left behind.', color: '#a855f7',
    placeholder: 'Why did it die, and should I relaunch it in Pune? Add its old website below.' },
]
const guessStage = (t: string): Stage | undefined =>
  /closed|shut|dead|died|defunct|revive|relaunch/i.test(t) ? 'Revive'
    : /declin|fall|falling|halved|bleed|struggl|losing|loss/i.test(t) ? 'Rescue'
    : undefined

const DEMOS: { title: string; short: string; stage: Stage; text: string; url?: string }[] = [
  { title: 'Pune Tiffin', short: 'A student meal subscription', stage: 'Launch', text: MOCK_TEXT },
  {
    title: 'Coaching Co', short: 'A classroom ready to scale', stage: 'Grow',
    text: 'A profitable exam-prep academy in Pune with 4,200 students wants to expand into two new cities without losing its teaching quality. Should it, and how?',
  },
  {
    title: 'Phone shop', short: 'A retailer losing sales', stage: 'Rescue',
    text: "My company sells mobile phones in Pune. Sales used to be good but they've halved since March. What's going on and what should I do first?",
  },
  {
    title: 'Simpl BNPL', short: 'Halted by the RBI', stage: 'Revive', url: 'https://getsimpl.com',
    text: 'Why did Simpl die after the RBI halted its payments, and should someone relaunch it? List the competitors and market players.',
  },
]

const ACCEPT = ['pdf', 'csv', 'xlsx', 'txt', 'md', 'docx']
const MAX_FILES = 3
const MAX_MB = 5
const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

export function Home() {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [stage, setStage] = useState<Stage>('Launch')
  const [depth, setDepth] = useState<'fast' | 'deep'>('fast')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [recent] = useState(loadRecent)
  const [files, setFiles] = useState<File[]>([])
  const [fileMsg, setFileMsg] = useState('')
  const [strict, setStrict] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheets, setSheets] = useState<Doc[]>([])
  const [sheetErr, setSheetErr] = useState('')
  const [sheetBusy, setSheetBusy] = useState(false)
  const attached = files.length + sheets.length
  const urlOk = /^https?:\/\/\S+\.\S+/.test(url.trim())
  const t = text.trim()
  // Short questions ("What is UPI?") are allowed: the router answers them directly. With documents attached,
  // a couple of words ("Is this viable?") is enough. A website alone is enough too; both go together.
  const urlBad = !!url.trim() && !urlOk
  // an attached file or sheet is enough on its own: the backend asks "Analyse the attached documents."
  const ok = !urlBad && t.length <= 4000 && (t.length >= 5 || (attached && (!t || t.length >= 2)) || (urlOk && !t))
  const st = STAGES.find((x) => x.name === stage)!

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const msgs: string[] = []
    const next = [...files]
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ACCEPT.includes(ext)) msgs.push(`${f.name}: only PDF, CSV, XLSX, TXT, MD or DOCX files.`)
      else if (f.size > MAX_MB * 1024 * 1024) msgs.push(`${f.name} is ${fmtSize(f.size)}; the limit is ${MAX_MB} MB.`)
      else if (next.some((x) => x.name === f.name && x.size === f.size)) continue
      else if (next.length + sheets.length >= MAX_FILES) { msgs.push(`Up to ${MAX_FILES} files, please.`); break }
      else next.push(f)
    }
    setFiles(next)
    setFileMsg(msgs.join(' '))
  }

  useEffect(() => { document.title = 'Necromancer' }, [])

  const addSheet = async (sample = false) => {
    const u = sheetUrl.trim()
    if (!sample && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(u)) return setSheetErr('Paste a Google Sheets link (https://docs.google.com/spreadsheets/…).')
    if (attached >= MAX_FILES) return setSheetErr(`Up to ${MAX_FILES} files or sheets, please.`)
    setSheetBusy(true)
    setSheetErr('')
    try {
      const got = sample || isMock() ? [MOCK_SHEET] : await connectSheet(u)
      setSheets((cur) => [...cur, ...got.filter((d) => !cur.some((x) => x.id === d.id))])
      setSheetUrl('')
    } catch (e) {
      setSheetErr(e instanceof Error ? e.message : String(e))
    } finally { setSheetBusy(false) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setErr('')
    try {
      const docs = files.length ? await uploadDocuments(files) : []
      const document_ids = [...sheets.map((d) => d.id), ...docs.map((d) => d.id)]
      const u = urlOk ? url.trim() : undefined
      const lc = stage.toLowerCase() as Lower
      const id = await startCase({ text: t, url: u, depth, document_ids, strict, stage: lc })
      saveRecent({ id, title: (t || url.trim()).slice(0, 80), text: t || undefined, url: u, depth, at: Date.now(), document_ids, strict, stage: lc })
      nav(`/case/${id}${mockQ()}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const pickDemo = (d: (typeof DEMOS)[number]) => {
    setText(d.text)
    setUrl(d.url ?? '')
    setStage(d.stage)
    document.getElementById('situation')?.focus()
  }

  return (
    <div className="pt-2 sm:pt-6">
      <h1 className="mb-5 font-serif text-[26px] font-bold tracking-[-.02em] sm:text-[32px]">
        Describe your business. <span className="text-[var(--seal)]">Get a verdict.</span>
      </h1>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={submit} className="sheet min-w-0 space-y-4 p-4 sm:p-7">
          <div>
            <p className="eyebrow">01 / Your situation</p>
            <h2 className="mt-2 font-serif text-[26px] font-semibold leading-tight sm:text-[32px]">What's going on with your business?</h2>
          </div>

          <fieldset>
            <legend className="eyebrow mb-3">02 / Where is it on its lifeline?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STAGES.map((x) => (
                <label
                  key={x.name}
                  className={`stage-card cursor-pointer rounded-md border p-3 text-left text-sm ${stage === x.name ? 'on' : 'border-hair'}`}
                  style={{ ['--aura' as string]: x.color }}
                >
                  <input type="radio" name="stage" value={x.name} checked={stage === x.name} onChange={() => setStage(x.name)} className="sr-only" />
                  <span aria-hidden className="text-lg" style={{ color: x.color }}>{x.glyph}</span>
                  <span className="mt-2 block font-serif text-sm font-bold uppercase tracking-[.06em]">{x.name}</span>
                  <span className="block text-xs leading-snug text-ink-soft">{x.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="sr-only" htmlFor="situation">Your situation</label>
          <textarea
            id="situation"
            className="field min-h-40 text-[17px] leading-7 [field-sizing:content]"
            placeholder={st.placeholder}
            value={text}
            maxLength={4000}
            onChange={(e) => {
              setText(e.target.value)
              const g = guessStage(e.target.value)
              if (g) setStage(g)
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e) }}
          />

          <div className={stage === 'Revive' ? 'rounded-md border border-seal/40 p-3' : ''}>
            <label htmlFor="url" className="text-sm text-ink-soft">
              Company website or link (optional) — a dead startup's old site, a competitor, an article…
            </label>
            <input id="url" type="url" className="field mt-1" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            {urlBad && <p className="mt-1 text-sm text-ink-soft">Use a full link starting with https://</p>}
            {urlOk && <p className="mt-1 text-xs text-ink-soft">The court reads this link alongside your question.</p>}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
          <div
            className={`rounded-md border border-dashed p-4 text-sm transition-colors ${dragging ? 'border-seal bg-sheet' : 'border-hair'}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Company details? Drop a pitch deck, financials or notes here, or</span>
              <label className="btn btn-line cursor-pointer !px-3 !py-1 focus-within:outline-2 focus-within:outline-seal">
                Choose files
                <input
                  type="file"
                  multiple
                  accept={ACCEPT.map((x) => '.' + x).join(',')}
                  className="sr-only"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-ink-soft">PDF, CSV, XLSX, TXT, MD or DOCX · up to {MAX_FILES} files, {MAX_MB} MB each.</p>
            {files.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Attached files">
                {files.map((f, i) => (
                  <li key={f.name + f.size} className="chip flex max-w-full items-center gap-1.5 !px-2 !py-0.5 text-sm">
                    <span aria-hidden>{DOC_ICON[kindOf(f.name)]}</span>
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-ink-soft">{fmtSize(f.size)}</span>
                    <button
                      type="button"
                      className="shrink-0 px-1 text-ink-soft hover:text-ink"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => { setFiles(files.filter((_, j) => j !== i)); setFileMsg('') }}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {fileMsg && <p role="alert" className="fam-stop mt-2 text-sm">{fileMsg}</p>}
            <p className="mt-2 text-xs text-ink-soft">
              Files are read in memory to brief the council; they're treated as data, never as instructions.
            </p>
          </div>
          <div className="rounded-md border border-hair p-4 text-sm">
            <label htmlFor="sheet" className="font-medium"><span aria-hidden>{DOC_ICON.sheet}</span> Connect a Google Sheet</label>
            <p className="text-xs text-ink-soft">Paste the link: we read your numbers (sales, customers, costs…) and the council analyses your real performance. Update the sheet later and re-analyse in one click.</p>
            <p className="mt-1 text-xs"><span className="text-ink-soft">First, in Google Sheets:</span> <b>Share → Anyone with the link → Viewer</b></p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                id="sheet" type="url" className="field min-w-0 flex-1 !py-1.5" placeholder="https://docs.google.com/spreadsheets/d/…"
                value={sheetUrl} onChange={(e) => { setSheetUrl(e.target.value); setSheetErr('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSheet() } }}
              />
              <button type="button" className="btn btn-line !px-3 !py-1" onClick={() => addSheet()} disabled={sheetBusy || !sheetUrl.trim()}>
                {sheetBusy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            {isMock() && (
              <button type="button" className="mt-1 text-xs underline underline-offset-2 text-ink-soft hover:text-ink" onClick={() => addSheet(true)}>
                Use a sample sheet
              </button>
            )}
            {sheets.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Connected sheets">
                {sheets.map((d) => (
                  <li key={d.id} className="chip flex max-w-full items-center gap-1.5 !px-2 !py-0.5 text-sm">
                    <span aria-hidden>{DOC_ICON[d.kind] ?? DOC_ICON.sheet}</span>
                    <span className="truncate">{d.name}</span>
                    <span className="shrink-0 text-ink-soft">{docLabel(d)}</span>
                    <button type="button" className="shrink-0 px-1 text-ink-soft hover:text-ink" aria-label={`Remove ${d.name}`}
                      onClick={() => setSheets(sheets.filter((x) => x.id !== d.id))}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            {sheetErr && <p role="alert" className="fam-stop mt-2">{sheetErr}</p>}
          </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-1 accent-[var(--seal)]" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
            <span>Strict Soul Binder — sends back any case with weak or single-source evidence (slower, more rigorous)</span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <fieldset className="flex items-center gap-2 text-sm">
              <legend className="sr-only">Depth</legend>
              {(['fast', 'deep'] as const).map((d) => (
                <label key={d} className={`btn btn-line cursor-pointer !px-3 !py-1 ${depth === d ? 'border-seal! text-seal bg-seal/10' : ''}`}>
                  <input type="radio" name="depth" value={d} checked={depth === d} onChange={() => setDepth(d)} className="sr-only" />
                  {d === 'fast' ? 'Fast' : 'Deep'}
                </label>
              ))}
              <span className="text-ink-soft">
                {depth === 'fast' ? 'About 1.5 min.' : 'About 2.5 min, more thorough.'}
              </span>
            </fieldset>
            <button type="submit" className="btn btn-seal" disabled={!ok || busy}>
              {busy ? 'Opening…' : 'Summon the council'}
            </button>
          </div>
          {!ok && t.length > 0 && t.length < (attached ? 2 : 5) && <p className="text-sm text-ink-soft">A few more words, please.</p>}
          {err && <p role="alert" className="fam-stop text-sm">{err}{/^(The court|Failed to fetch)/.test(err) && ' Is the backend running on port 8000?'}</p>}
        </form>

        <aside className="min-w-0 space-y-8">
          <section aria-labelledby="demos-h" className="sheet p-5">
            <p className="eyebrow">Quick summon</p>
            <h2 id="demos-h" className="mt-1 font-serif text-xl font-semibold">Try a case</h2>
            <p className="text-xs text-ink-soft">Fills the form; the council researches it live.</p>
            <ul className="mt-2 space-y-1.5">
              {DEMOS.map((d) => (
                <li key={d.title}>
                  <button type="button" onClick={() => pickDemo(d)} className="btn btn-line flex w-full items-center justify-between gap-3 !px-3 !py-2 text-left">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{d.title}</span>
                      <span className="block truncate text-xs text-ink-soft">{d.short}{d.url && ' · with its website'}</span>
                    </span>
                    <span className="shrink-0 text-xs" style={{ color: STAGES.find((x) => x.name === d.stage)!.color }}>{d.stage}</span>
                  </button>
                </li>
              ))}
              <li className="pt-1 text-xs text-ink-soft">
                Or a quick question:{' '}
                <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => { setText('What is UPI?'); setUrl('') }}>What is UPI?</button>
              </li>
            </ul>
          </section>

          <RecentCases recent={recent} />
        </aside>
      </div>

      <p className="mt-12 border-t border-hair pt-5 font-mono text-[10px] uppercase tracking-[.1em] text-ink-soft">
        Plain code checks the listings and the math. AI weighs the evidence. Every claim carries its source.
      </p>
    </div>
  )
}

/** Root cases, newest first, with their follow-ups nested underneath (oldest first). */
const PER_PAGE = 6

function RecentCases({ recent }: { recent: Recent[] }) {
  const ids = new Set(recent.map((r) => r.id))
  const allRoots = recent.filter((r) => !r.root || !ids.has(r.root))
  const pages = Math.max(1, Math.ceil(allRoots.length / PER_PAGE))
  const [page, setPage] = useState(0)
  const roots = allRoots.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
  const kids = (id: string) => recent.filter((r) => r.root === id).sort((a, b) => a.at - b.at)
  const row = (r: Recent, child: boolean) => {
    const fam = r.verdict ? familyOf(r.verdict) : undefined
    return (
      <li key={r.id} className={`py-2 text-sm ${child ? 'pl-4' : ''}`}>
        {child && <span aria-label="follow-up" className="text-ink-soft">↳ </span>}
        <Link to={`/case/${r.id}${r.id.startsWith('mock-') ? '?mock=1' : ''}`} className="hover:underline">{r.title}</Link>
        <span className="text-ink-soft">
          {r.url && !child && ' · 🔗'}
          {r.verdict && <> · <span className={fam ? `fam-${fam}` : ''}>{r.verdict}</span></>} · {ago(r.at)}
        </span>
      </li>
    )
  }
  return (
    <section aria-labelledby="recent-h" className="sheet p-5">
      <p className="eyebrow">From the graveyard</p>
      <h2 id="recent-h" className="mt-1 font-serif text-xl font-semibold">Recent cases</h2>
      {!recent.length && <p className="mt-2 text-sm text-ink-soft">Your past cases will appear here.</p>}
      <ul className="mt-1 divide-y divide-hair">
        {roots.map((r) => [row(r, false), ...kids(r.id).map((k) => row(k, true))])}
      </ul>
      {pages > 1 && (
        <nav aria-label="Recent cases pages" className="mt-3 flex flex-wrap items-center gap-1 text-sm">
          <button type="button" className="btn btn-line !px-2 !py-0.5" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" aria-current={i === page ? 'page' : undefined}
              className={`btn !px-2 !py-0.5 ${i === page ? 'btn-seal' : 'btn-line'}`} onClick={() => setPage(i)}>{i + 1}</button>
          ))}
          <button type="button" className="btn btn-line !px-2 !py-0.5" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next →</button>
        </nav>
      )}
    </section>
  )
}
