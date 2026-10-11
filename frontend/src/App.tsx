import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { familyOf, isMock, loadRecent, saveRecent, startCase } from './lib'
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
        <button onClick={toggle} className="btn btn-line text-sm" aria-label="Toggle light or dark theme">
          ◐ Theme
        </button>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
    </div>
  )
}

const SAMPLES: [string, string][] = [
  ['Tiffin service idea', MOCK_TEXT],
  [
    'Simpl BNPL, halted by RBI',
    'Simpl, the Indian BNPL startup, had its payment operations halted by the RBI. Why did it die, should it be revived, and how? List the competitors and market players.',
  ],
  [
    'Phone shop losing sales',
    "My company sells mobile phones in Pune. Sales used to be good but they've halved since March. What's going on and what should I do first?",
  ],
  ['What is UPI?', 'What is UPI?'],
]

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
  const [depth, setDepth] = useState<'fast' | 'deep'>('fast')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [recent] = useState(loadRecent)
  const urlOk = /^https?:\/\/\S+\.\S+/.test(url.trim())
  const t = text.trim()
  // Short questions ("What is UPI?") are allowed: the router answers them directly.
  const ok = (t.length >= 5 && t.length <= 4000) || (!t && urlOk)

  useEffect(() => { document.title = 'Necromancer' }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    setErr('')
    try {
      const id = await startCase({ text: t || undefined, url: t ? undefined : url.trim(), depth })
      saveRecent({ id, title: (t || url.trim()).slice(0, 80), text: t || undefined, url: url.trim() || undefined, depth, at: Date.now() })
      nav(`/case/${id}${isMock() ? '?mock=1' : ''}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[68ch] pt-6 sm:pt-12">
      <form onSubmit={submit} className="space-y-4">
        <h1 className="font-serif text-[32px] leading-tight sm:text-[44px]">What's going on with your business?</h1>
        <p className="text-ink-soft">
          An idea, a business that's growing or struggling, or one that already shut down. Describe it like you'd
          tell a friend.
        </p>
        <label className="sr-only" htmlFor="situation">Your situation</label>
        <textarea
          id="situation"
          className="field min-h-40 font-serif text-[20px] [field-sizing:content]"
          placeholder="My company sells mobile phones. Sales used to be good but they've halved since March…"
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e) }}
        />
        <div>
          <label htmlFor="url" className="text-sm text-ink-soft">Shut down already? Add its old website (optional)</label>
          <input id="url" type="url" className="field mt-1" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

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
            {busy ? 'Opening…' : 'Open the case'}
          </button>
        </div>
        {!ok && t.length > 0 && t.length < 5 && <p className="text-sm text-ink-soft">A few more words, please.</p>}
        {err && <p role="alert" className="fam-stop text-sm">{err} Is the backend running on port 8000?</p>}
      </form>

      <p className="mt-8 text-sm text-ink-soft">
        Try one:{' '}
        {SAMPLES.map(([label, sample], i) => (
          <span key={label}>
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => setText(sample)}>
              {label}
            </button>
            {i < SAMPLES.length - 1 && ' · '}
          </span>
        ))}
      </p>

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif text-xl">Recent cases</h2>
          <ul className="mt-2 divide-y divide-hair">
            {recent.map((r) => {
              const fam = r.verdict ? familyOf(r.verdict) : undefined
              return (
                <li key={r.id} className="py-2 text-sm">
                  <Link to={`/case/${r.id}${r.id.startsWith('mock-') ? '?mock=1' : ''}`} className="hover:underline">
                    {r.title}
                  </Link>
                  <span className="text-ink-soft">
                    {r.verdict && <> · <span className={fam ? `fam-${fam}` : ''}>{r.verdict}</span></>} · {ago(r.at)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
