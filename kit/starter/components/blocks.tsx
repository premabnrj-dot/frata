import Link from 'next/link'
import type { Block, FaqItem } from '@/lib/frrata'
import { Photo } from './photo'

/** A store page, block by block. Text is text: never HTML. A block kind this site doesn't know is skipped. */
export function Blocks({ blocks, policies }: { blocks: Block[]; policies: Map<string, string> }) {
  return <>{blocks.map((b, i) => <One key={i} b={b} policies={policies} />)}</>
}
function One({ b, policies }: { b: Block; policies: Map<string, string> }) {
  switch (b.kind) {
    case 'heading': return b.level === 2 ? <h2>{b.text}</h2> : <h3>{b.text}</h3>
    case 'text': return <>{b.paragraphs?.map((p, i) => <p key={i}>{p.map((r, j) => {
      const t = r.bold ? <b>{r.text}</b> : r.italic ? <i>{r.text}</i> : r.text
      return r.link ? <Link key={j} href={r.link}>{t}</Link> : <span key={j}>{t}</span>
    })}</p>)}</>
    case 'image': return b.image ? <Photo image={b.image} sizes="(max-width: 640px) 100vw, 720px" /> : null
    case 'button': return b.link ? <Link className="primary" href={b.link}>{b.label}</Link> : null
    case 'questions': return <Questions items={b.items ?? []} policies={policies} />
    case 'group': return <div className="group"><Blocks blocks={b.blocks ?? []} policies={policies} /></div>
    case 'columns': return <div className="columns"><Blocks blocks={b.blocks ?? []} policies={policies} /></div>
    default: return null
  }
}
export function Questions({ items, policies }: { items: FaqItem[]; policies: Map<string, string> }) {
  return <div className="faq">{items.map((q, i) => (
    <details key={i}><summary>{q.question}</summary>
      {q.policy && policies.get(q.policy) ? <p><a href={policies.get(q.policy)}>Read the policy</a></p> : q.answer ? <p>{q.answer}</p> : null}</details>))}</div>
}
