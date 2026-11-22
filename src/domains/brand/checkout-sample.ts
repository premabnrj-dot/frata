// =============================================================================
// FILE: src/domains/brand/checkout-sample.ts — THE CHECKOUT PREVIEW'S SAMPLE DATA, PURE (one-address plan P2·5; spec § 3
// "Preview"; mockup docs/mockups/2026-11-16-p2-checkout.html screen 8). A sample bag of the store's OWN products
// (reconciliation 2: never a made-up product), a sample shopper and address, and every state the preview lists, priced
// with the store's own delivery and Pay on delivery rules. Nothing here is a real order or a real shopper. Pure: no I/O.
// =============================================================================

import { rupeesWords } from '@/domains/money/rupees'
import { codFor, shippingFor, type DeliveryRules } from '@/domains/checkout/delivery'
import { codWhyNot } from '@/domains/checkout/cod-words'

export const PREVIEW_PAGES = [['checkout', 'Checkout'], ['order', 'Order page'], ['baglink', 'Bag link'], ['policy', 'Policy']] as const
export type PreviewPage = (typeof PREVIEW_PAGES)[number][0]
export const PREVIEW_STATES = [['ready', 'Ready to pay'], ['nocod', 'Pay on delivery not offered'], ['sold', 'A sold-out line'], ['changed', 'A changed price'], ['failed', 'Payment failed']] as const
export type PreviewState = (typeof PREVIEW_STATES)[number][0]

/** The sample shopper (the mockup's): a name, phone and address that belong to nobody. */
export const SAMPLE_SHOPPER = { phone: '98000 00000', email: 'priya@example.com', name: 'Priya Sharma', first: 'Priya', pincode: '560038', city: 'Bengaluru', house: '12, 4th Cross', area: 'Indiranagar', state: 'Karnataka' } as const

/** One of the store's own products: its title, the first size's words, its price in paise and a 400 px photo. */
export type SampleItem = { title: string; size: string; price: number; photo: string | null }
/** The store's own rules the preview prices with: checkout's (src/domains/checkout/delivery.ts), never a copy. */
export type SampleRules = Pick<DeliveryRules, 'shippingFlat' | 'freeShippingAbove' | 'codOn' | 'codMin' | 'codMax' | 'codCharge'>

export type SampleLine = { item: SampleItem; qty: number; soldOut: boolean }
export type SampleCheckout = {
  lines: SampleLine[]; subtotal: number; shipping: number; total: number
  /** Pay on delivery offered on this bag, or why not (today's words). */
  cod: boolean; codWhy: string | null
  method: 'cod' | 'prepaid'; failed: boolean
  /** The changed-price line above the form (today's words, checkout-place.ts changedText). */
  changed: string | null
}

/** The sample checkout for a state: the first product, two for "not offered", a sold-out second line, a price up ₹100. */
export function sampleCheckout(items: readonly SampleItem[], r: SampleRules, state: PreviewState): SampleCheckout | null {
  const [a, b] = items
  if (!a) return null
  let lines: SampleLine[] = [{ item: a, qty: 1, soldOut: false }]
  let changed: string | null = null
  if (state === 'nocod') lines = [{ item: a, qty: 1, soldOut: false }, { item: b ?? a, qty: b ? 1 : 2, soldOut: false }]
  if (state === 'sold') lines = [{ item: a, qty: 1, soldOut: false }, { item: { ...(b ?? a) }, qty: 1, soldOut: true }]
  if (state === 'changed') {
    const up = { ...a, price: a.price + 10000 }
    lines = [{ item: up, qty: 1, soldOut: false }]
    changed = `Something changed since you looked: ${a.title}: ${rupeesWords(a.price)} → ${rupeesWords(up.price)}. Check the total and place the order again.`
  }
  const subtotal = lines.filter((l) => !l.soldOut).reduce((s, l) => s + l.item.price * l.qty, 0)
  const shipping = shippingFor(subtotal, r)
  // "Not offered" is the state's point: the store's own reason when the bag meets one, else its limit (or "off").
  const real = codFor(subtotal + shipping, r)
  const c = state === 'nocod' && real.offered ? (r.codMax > 0 ? { offered: false as const, reason: 'above_max' as const, max: r.codMax } : { offered: false as const, reason: 'off' as const }) : real
  const cod = c.offered
  const codWhy = codWhyNot(c, rupeesWords)
  const method = state === 'nocod' || state === 'failed' || !cod ? 'prepaid' : 'cod'
  const total = subtotal + shipping + (method === 'cod' ? r.codCharge : 0)
  return { lines, subtotal, shipping, total, cod, codWhy, method, failed: state === 'failed', changed }
}
