import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DOC_ICON, familyOf, isMock, kindOf, loadRecent, saveRecent, startCase, uploadDocuments, type Recent } from './lib'
import { MOCK_TEXT } from './mock'

export function Shell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? '')
  const toggle = () => {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch { /* ignore */ }
    setTheme(next)
  }
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to={isMock() ? '/?mock=1' : '/'} className="font-serif text-xl font-semibold">
          Necromancer
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/compare" className="btn btn-line text-sm">📗 Compare Excel</Link>
          <button onClick={toggle} className="btn btn-line text-sm" aria-label="Toggle light or dark theme">
            ◐ Theme
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
    </div>
  )
}

// Where the business is on its lifeline. Guides the wording only; the router reads the situation itself.
type Stage = 'Launch' | 'Grow' | 'Rescue' | 'Revive'
const STAGES: { name: Stage; glyph: string; desc: string; color: string; placeholder: string }[] = [
  { name: 'Launch', glyph: '✦', desc: 'An idea waiting for its first proof.', color: 'var(--go)',
    placeholder: 'I want to start a tiffin service in Pune for college students at ₹2500/month…' },
  { name: 'Grow', glyph: '↗', desc: 'A living company reaching for more.', color: 'var(--ghost)',
    placeholder: 'My coaching academy is profitable with 4,200 students. Should we open in two new cities?' },
  { name: 'Rescue', glyph: '♥', desc: 'Sales or cash running low.', color: 'var(--caution)',
    placeholder: "My company sells mobile phones. Sales used to be good but they've halved since March…" },
  { name: 'Revive', glyph: '☠', desc: 'Shut down, with something left behind.', color: 'var(--seal)',
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

const ACCEPT = ['pdf', 'csv', 'xlsx', 'xlsm', 'txt', 'md', 'docx']
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
  const urlOk = /^https?:\/\/\S+\.\S+/.test(url.trim())
  const t = text.trim()
  // Short questions ("What is UPI?") are allowed: the router answers them directly. With documents attached,
  // a couple of words ("Is this viable?") is enough. A website alone is enough too; both go together.
  const urlBad = !!url.trim() && !urlOk
  const ok = !urlBad && t.length <= 4000 && (t.length >= (files.length ? 2 : 5) || (urlOk && !t))
  const st = STAGES.find((x) => x.name === stage)!

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const msgs: string[] = []
    const next = [...files]
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!ACCEPT.includes(ext)) msgs.push(`${f.name}: only PDF, Excel, CSV, TXT, MD or DOCX files.`)
      else if (f.size > MAX_MB * 1024 * 1024) msgs.push(`${f.name} is ${fmtSize(f.size)}; the limit is ${MAX_MB} MB.`)
      else if (next.some((x) => x.name === f.name && x.size === f.size)) continue
      else if (next.length >= MAX_FILES) { msgs.push(`Up to ${MAX_FILES} files, please.`); break }
      else next.push(f)
    }
    setFiles(next)
    setFileMsg(msgs.join(' '))
  }

  useEffect(() => { document.title = 'Necromancer' }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setErr('')
    try {
      const docs = files.length ? await uploadDocuments(files) : []
      const document_ids = docs.map((d) => d.id)
      const u = urlOk ? url.trim() : undefined
      const id = await startCase({ text: t, url: u, depth, document_ids, strict })
      saveRecent({ id, title: (t || url.trim()).slice(0, 80), text: t || undefined, url: u, depth, at: Date.now(), document_ids, strict })
      nav(`/case/${id}${isMock() ? '?mock=1' : ''}`)
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
      <section className="hero relative mb-8 overflow-hidden rounded-md" aria-labelledby="hero-title">
        <img src="/hero.webp" alt="" width={960} height={536} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
        <div className="relative max-w-[60ch] px-5 py-8 sm:px-8 sm:py-14">
          <p className="text-xs font-medium uppercase tracking-[.14em] opacity-80">The business afterlife engine</p>
          <h1 id="hero-title" className="mt-2 font-serif text-[36px] font-semibold leading-[1.02] sm:text-[60px]">
            Every company leaves a ghost.
          </h1>
          <p className="mt-3 max-w-[48ch] text-[15px] opacity-90 sm:text-base">
            Describe a business: an idea, one that's growing or struggling, or one that already died. A council of ghosts
            researches it live, the Soul Binder cross-examines them, and you get a verdict with sources.
          </p>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={submit} className="min-w-0 space-y-4">
          <h2 className="font-serif text-[28px] leading-tight sm:text-[36px]">What's going on with your business?</h2>

          <fieldset>
            <legend className="mb-2 text-sm text-ink-soft">Where is it on its lifeline?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STAGES.map((x) => (
                <label
                  key={x.name}
                  className={`stage-card cursor-pointer rounded-md border p-3 text-left text-sm ${stage === x.name ? 'on' : 'border-hair'}`}
                  style={{ ['--aura' as string]: x.color }}
                >
                  <input type="radio" name="stage" value={x.name} checked={stage === x.name} onChange={() => setStage(x.name)} className="sr-only" />
                  <span aria-hidden className="text-lg" style={{ color: x.color }}>{x.glyph}</span>
                  <span className="mt-1 block font-medium">{x.name}</span>
                  <span className="block text-xs leading-snug text-ink-soft">{x.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="sr-only" htmlFor="situation">Your situation</label>
          <textarea
            id="situation"
            className="field min-h-40 font-serif text-[20px] [field-sizing:content]"
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
            <p className="mt-1 text-xs text-ink-soft">PDF, Excel (XLSX), CSV, TXT, MD or DOCX · up to {MAX_FILES} files, {MAX_MB} MB each.</p>
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
          <label className="flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-1 accent-[var(--seal)]" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
            <span>Strict Soul Binder — sends back any case with weak or single-source evidence (slower, more rigorous)</span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <fieldset className="flex items-center gap-2 text-sm">
              <legend className="sr-only">Depth</legend>
              {(['fast', 'deep'] as const).map((d) => (
                <label key={d} className={`btn btn-line cursor-pointer !px-3 !py-1 ${depth === d ? 'border-seal! text-seal' : ''}`}>
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
          {!ok && t.length > 0 && t.length < (files.length ? 2 : 5) && <p className="text-sm text-ink-soft">A few more words, please.</p>}
          {err && <p role="alert" className="fam-stop text-sm">{err}{/^(The court|Failed to fetch)/.test(err) && ' Is the backend running on port 8000?'}</p>}
        </form>

        <aside className="min-w-0 space-y-8">
          <section aria-labelledby="demos-h">
            <h2 id="demos-h" className="font-serif text-xl">Try a case</h2>
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

          <section aria-labelledby="compare-h">
            <h2 id="compare-h" className="font-serif text-xl">Compare financials</h2>
            <p className="text-xs text-ink-soft">
              Two Excel sheets of the same business (last year vs this year, actual vs what-if): see every changed number and how it moves the verdict.
            </p>
            <Link to="/compare" className="btn btn-line mt-2 flex w-full items-center justify-between !px-3 !py-2 text-sm">
              <span>📗 Open the ledger comparison</span><span aria-hidden>→</span>
            </Link>
          </section>

          <RecentCases recent={recent} />
        </aside>
      </div>

      <p className="mt-12 border-t border-hair pt-4 text-xs text-ink-soft">
        Plain code checks the listings and the math. AI weighs the evidence. Every claim carries its source.
      </p>
    </div>
  )
}

/** Root cases, newest first, with their follow-ups nested underneath (oldest first). */
function RecentCases({ recent }: { recent: Recent[] }) {
  if (!recent.length) return null
  const ids = new Set(recent.map((r) => r.id))
  const roots = recent.filter((r) => !r.root || !ids.has(r.root)).slice(0, 6)
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
    <section aria-labelledby="recent-h">
      <h2 id="recent-h" className="font-serif text-xl">Recent cases</h2>
      <ul className="mt-1 divide-y divide-hair">
        {roots.map((r) => [row(r, false), ...kids(r.id).map((k) => row(k, true))])}
      </ul>
    </section>
  )
}
