import { inr, type PublicQuote } from './shop-client'

/** What changed since the shopper looked (a refused placement only: loaded then, never on first paint). */
export function changedText(prev: PublicQuote | null, next: PublicQuote): string {
  const out: string[] = []
  for (const l of next.lines) {
    const p = prev?.lines.find((x) => x.variantId === l.variantId)
    if (p && p.unitPrice !== l.unitPrice) out.push(`${l.title}: ${inr(p.unitPrice)} → ${inr(l.unitPrice)}`)
    if (l.problem === 'reduced') out.push(`Only ${l.qty} of ${l.title} left — quantity set to ${l.qty}`)
    if (l.problem === 'sold_out' || l.problem === 'gone') out.push(`${l.title} sold out`)
  }
  return out.length ? `Something changed since you looked: ${out.join('; ')}. Check the total and place the order again.` : 'The total changed. Check it and place the order again.'
}
