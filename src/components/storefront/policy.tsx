import { renderPolicy, type Piece, type PolicyFacts, type PolicyPage } from '@/domains/policies/render'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'

// A shop's policy text, as shoppers read it and as Settings previews it: one
// rendering (storefront review 2026-11-07). In shopper mode a missing fact is
// left out; in the preview it is marked for the merchant to fill.

export const POLICY_TITLE: Record<PolicyPage, string> = { returns: 'Returns and exchanges', shipping: 'Shipping', privacy: 'Privacy', terms: 'Terms of sale', contact: 'Contact us' }
const inr = (p: number) => formatInr(paise(p))

export function Pieces({ paragraphs, shopper = false }: { paragraphs: Piece[][]; shopper?: boolean }) {
  return (
    <>
      {paragraphs.map((para, i) => (
        <p key={i}>{para.map((p, j) => ('text' in p ? <span key={j}>{p.text}</span>
          : p.value === null ? (shopper ? null : <span key={j} className="rounded-sm bg-danger px-1 text-danger-text">add your {p.fact}</span>)
          : shopper ? <span key={j}>{p.value}</span> : <span key={j} className="rounded-sm bg-store-chip px-0.5">{p.value}</span>))}</p>
      ))}
    </>
  )
}

/** The body of one policy page: the merchant's own text if they rewrote it, else written from Settings. */
export function PolicyBody({ page, facts, override, shopper = false }: { page: PolicyPage; facts: PolicyFacts; override?: string | null; shopper?: boolean }) {
  return override
    ? <>{override.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}</>
    : <Pieces paragraphs={renderPolicy(page, facts, inr)} shopper={shopper} />
}
