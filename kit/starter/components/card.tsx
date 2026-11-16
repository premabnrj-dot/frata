import Link from 'next/link'
import { rupees, type Card } from '@/lib/frrata'
import { Photo } from './photo'

/** A product in a list: photo, title, price (a struck prior price after a recent cut), and its one offer tag. */
export function ProductCard({ p, priority = false }: { p: Card; priority?: boolean }) {
  return (
    <Link href={`/products/${p.handle}`} className="card">
      <Photo image={p.image} sizes="(max-width: 640px) 50vw, 25vw" priority={priority} />
      {p.badge ? <span className="tag">{p.badge}</span> : null}
      <span className="title">{p.title}</span>
      {p.price ? <span className="price">{p.price.min !== p.price.max ? 'From ' : ''}{rupees(p.price.min)}{p.price.priorPrice ? <s> {rupees(p.price.priorPrice)}</s> : null}</span> : null}
      {p.availability?.kind === 'sold_out' ? <span className="muted">Sold out</span> : null}
    </Link>
  )
}
