import { Fragment, type ReactNode } from 'react'
import type { Block } from '@/domains/storefront-api/docs'

/** Words with `names` in backticks: the names in code type (mockup § Docs). */
export function rich(text: string): ReactNode {
  const parts = text.split('`')
  return parts.length < 3 ? text : parts.map((t, i) => (i % 2 ? <code key={i} className="font-mono text-[0.92em]">{t}</code> : <Fragment key={i}>{t}</Fragment>))
}

/** An address with its method: the green GET, the address wrapping on a phone. */
export function Get({ path }: { path: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-md border border-border bg-sunk px-3 py-2.5 font-mono text-small [overflow-wrap:anywhere]">
      <span className="rounded bg-ok px-1.5 font-semibold text-ok-text">GET</span><span className="min-w-0">{path}</span>
    </div>
  )
}

/** A guide's or a reference page's blocks: headings, text, code, an address, a two-column table. */
export function Blocks({ body }: { body: Block[] }) {
  return <>{body.map((b, i) => 'h' in b ? <h2 key={i} className="mt-2 text-lg font-semibold">{b.h}</h2>
    : 'p' in b ? <p key={i} className="max-w-[68ch]">{rich(b.p)}</p>
    : 'get' in b ? <Get key={i} path={b.get} />
    // A phone wraps a long line rather than scrolling sideways (mockup § Docs phone).
    // One-line commands break after a slash, the next line indented (as drawn).
    : 'code' in b ? <pre key={i} className={`overflow-x-auto rounded-lg bg-bar px-4 py-3.5 font-mono text-[12.5px] leading-[19px] whitespace-pre text-bar-foreground max-md:whitespace-pre-wrap ${b.code.includes('\n') ? '' : 'max-md:pl-8 max-md:-indent-4'}`}>{b.code.includes('\n') ? b.code : b.code.split('/').map((s, j) => <Fragment key={j}>{j ? <>/<wbr /></> : null}{s}</Fragment>)}</pre>
    : <Table key={i} head={b.head} rows={b.rows} />)}</>
}

export function Table({ head, rows, mono = true }: { head: string[]; rows: string[][]; mono?: boolean }) {
  return (
    <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
      <thead><tr>{head.map((h) => <th key={h} scope="col" className="bg-sunk px-2.5 py-2 text-left text-small font-medium text-muted-foreground">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line-soft">{r.map((c, j) => <td key={j} className={`px-2.5 py-2 align-top ${j === 0 && mono ? 'font-mono text-small whitespace-nowrap' : ''}`}>{j === 0 && mono ? c : rich(c)}</td>)}</tr>)}</tbody>
    </table></div>
  )
}
