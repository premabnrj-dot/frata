'use client'

import { pick, urlFor } from '@/domains/media/sizes'
import { bag, MAX_QTY } from './bag-store'
import { inr, type PublicQuoteLine } from './shop-client'
import { goneOf, lineRows, type GoneLine } from '@/domains/checkout/line-rows'

// =============================================================================
// FILE: src/components/storefront/checkout-stepper.tsx — A CODE-SITE STORE'S CHECKOUT LINES, EDITABLE (one-address
// plan P2·4; owner decision 13; mockup docs/mockups/2026-11-16-p2-checkout.html screens 2 and 4). − and + (1 to 10) and
// Remove on each line, the bag drawer's pattern; − at 1 removes the line, and "Removed <product>. · Undo" takes its
// place (owner call 3). A sold-out or no-longer-sold line, from the quote's problem lines, shows why with Remove (it was
// hidden before, and the shopper learnt only when Place order was refused). A reduced line says how many are left.
// Every change writes the bag as `keep` (P0·2: checkout's own edits never make the bag the shopper's) and the quote
// re-prices it. Its own chunk, loaded as checkout mounts: checkout's first-load script stays in its budget, and until
// it is in, checkout draws its plain lines. Its rules are the brand frame's (brand-css.ts), never the shop's sheet.
// =============================================================================

export type Gone = GoneLine

function Alert() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="ck-ic-sm"><path d="M12 3.5 21 19.5H3Z" /><path d="M12 10v4.5M12 17v.2" /></svg>
}

export default function CheckoutStepper({ lines, gone, setGone }: { lines: readonly PublicQuoteLine[]; gone: readonly Gone[]; setGone: (f: (g: Gone[]) => Gone[]) => void }) {
  const remove = (l: PublicQuoteLine, at: number, undo: boolean) => {
    if (undo) setGone((g) => [...g.filter((x) => x.variantId !== l.variantId), goneOf(l, at)])
    bag.remove(l.variantId, 'keep')
  }
  const back = (x: Gone) => { setGone((g) => g.filter((y) => y.variantId !== x.variantId)); bag.add(x.variantId, x.qty, 'keep') }
  // Each removed line keeps its place (src/domains/checkout/line-rows.ts).
  const rows = lineRows(lines, gone)
  return (
    <ul className="ck-lines">
      {rows.map((r, i) => {
        if ('gone' in r) return (
          <li key={`gone-${r.gone.variantId}`} className="ck-gone" role="status">Removed {r.gone.title}.<button type="button" className="ck-link" onClick={() => back(r.gone)}>Undo</button></li>
        )
        const l = r.line, sold = l.problem === 'sold_out' || l.problem === 'gone', q = l.qty
        return (
          <li key={l.variantId} className={sold ? 'ck-line dim' : 'ck-line'}>
            <span className="ck-ph">{l.image ? <img src={urlFor(l.image.base, pick(l.image.widths, 160))} alt="" width={56} height={84} data-photo /> : null}</span>
            <span className="ck-tt">{l.title}<small>{l.values.join(' · ')}</small></span>
            <span className="ck-pr">{sold ? '' : inr(l.unitPrice * q)}</span>
            {/* feedback-ok: a line's state from the quote (left in stock), on the line it is about */}
            {l.problem === 'reduced' && <p className="ck-note">Only {q} left in {l.values.join(' · ')}.</p>}
            <div className="ck-ctl">
              {sold ? <>
                {/* feedback-ok: a line's state (sold out since it was added), on the line with its Remove (rule 5) */}
                <p className="ck-err"><Alert />{l.problem === 'gone' ? 'No longer sold.' : 'Sold out since you added it.'}</p>
                <button type="button" className="ck-link" onClick={() => remove(l, i, false)}>Remove</button>
              </> : <>
                <span className="ck-step">
                  <button type="button" aria-label={`One fewer ${l.title}`} onClick={() => (q <= 1 ? remove(l, i, true) : bag.set(l.variantId, q - 1, 'keep'))}><svg viewBox="0 0 24 24" aria-hidden="true" className="ck-ic-sm"><path d="M5 12h14" /></svg></button>
                  <span aria-live="polite">{q}</span>
                  <button type="button" aria-label={`One more ${l.title}`} disabled={q >= MAX_QTY || l.problem === 'reduced'} onClick={() => bag.set(l.variantId, q + 1, 'keep')}><svg viewBox="0 0 24 24" aria-hidden="true" className="ck-ic-sm"><path d="M12 5v14M5 12h14" /></svg></button>
                </span>
                <button type="button" className="ck-link" onClick={() => remove(l, i, true)}>Remove</button>
              </>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
