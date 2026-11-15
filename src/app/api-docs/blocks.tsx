import type { Block } from '@/domains/storefront-api/docs'

/** A guide's or a reference page's blocks: headings, text, code, a two-column table. */
export function Blocks({ body }: { body: Block[] }) {
  return <>{body.map((b, i) => 'h' in b ? <h2 key={i} className="mt-2 text-lg font-semibold">{b.h}</h2>
    : 'p' in b ? <p key={i} className="max-w-[68ch]">{b.p}</p>
    : 'code' in b ? <pre key={i} className="overflow-x-auto rounded-lg bg-bar px-4 py-3.5 font-mono text-[12.5px] leading-[19px] whitespace-pre text-bar-foreground">{b.code}</pre>
    : <Table key={i} head={b.head} rows={b.rows} />)}</>
}

export function Table({ head, rows, mono = true }: { head: string[]; rows: string[][]; mono?: boolean }) {
  return (
    <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
      <thead><tr>{head.map((h) => <th key={h} scope="col" className="bg-sunk px-2.5 py-2 text-left text-small font-medium text-muted-foreground">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line-soft">{r.map((c, j) => <td key={j} className={`px-2.5 py-2 align-top ${j === 0 && mono ? 'font-mono text-small whitespace-nowrap' : ''}`}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  )
}
