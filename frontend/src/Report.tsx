// The report document (markdown with a contents list). Kept apart from Dashboard so recharts can load lazily.
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Family } from './lib'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const textOf = (n: any): string => (n?.value ?? '') + (n?.children ?? []).map(textOf).join('')

const mdComponents: Components = {
  a: ({ node: _n, ...p }) => <a {...p} target="_blank" rel="noreferrer" />,
  table: ({ node: _n, ...p }) => <div className="table-wrap"><table {...p} /></div>,
  tr: ({ node, ...p }) => <tr {...p} className={textOf(node).includes('⚠') ? 'warn' : undefined} />,
}

// GFM swallows a line written right under a table as one more row (e.g. the "⚠️ = …" legend under
// "Verified by code"); a blank line makes it a paragraph again.
export const untable = (md: string) => md.replace(/^(\|.*)\n(?![ \t]*(\||$))/gm, '$1\n\n')

export const Md = ({ children }: { children: string }) => (
  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{untable(children)}</ReactMarkdown>
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
