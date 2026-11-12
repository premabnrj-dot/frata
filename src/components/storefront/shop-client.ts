'use client'

// The browser's calls to its own shop's API (same origin; the server takes the shop from the Host).
export type PublicQuoteLine = {
  variantId: string; handle: string; title: string; options: string[]; values: string[]; image: { base: string; widths: number[] } | null
  unitPrice: number; compareAt: number | null; requested: number; qty: number; kind: 'in_stock' | 'preorder' | 'made_to_order'
  shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; problem: 'gone' | 'sold_out' | 'reduced' | null
}
export type CodWhyNot = { reason: 'off' } | { reason: 'below_min'; min: number } | { reason: 'above_max'; max: number } | { reason: 'blocked_pincode'; pincode: string }
export type PublicApplied = { title: string; amount: number; class: 'product' | 'order' | 'shipping' | 'payment' }
export type PublicListed = { title: string; code: string | null; style: 'order_off' | 'free_shipping' | 'pay_online' | 'product_off' | 'bxgy' | 'free_gift'; applied: boolean
  need: { kind: 'add'; amount: number } | { kind: 'add_items'; n: number } | { kind: 'gift'; variantId: string } | { kind: 'pay_online' } | { kind: 'pay_on_delivery' } | { kind: 'first_order' } | null }
export type PublicQuote = {
  lines: PublicQuoteLine[]; subtotal: number; shipping: number; prepaid: number; gstPrepaid: number
  /** Offers (server-named fields only: shop-api publicQuote). */
  discountPrepaid: number; appliedPrepaid: PublicApplied[]
  /** What paying online saves on the items against paying on delivery (0: nothing). */
  savesOnline: number
  cod: { total: number; charge: number; gst: number; discount: number; applied: PublicApplied[] } | null; codWhyNot: CodWhyNot | null
  offers: { listed: PublicListed[]; code: 'applied' | 'beaten' | 'not_applied' | null }
  arrives: { from: string; to: string } | null; empty: boolean; missing: string[]
}
export type Pay = { keyId: string; razorpayOrderId: string; amount: number; name: string; phone: string; shop: string }

export async function api<T>(path: string, body: unknown): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; data: { error?: string; fields?: Record<string, string>; changed?: boolean; quote?: PublicQuote; codTotal?: number } }> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
    const data = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, status: r.status, data: data as T } : { ok: false, status: r.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'No connection. Check your internet and try again.' } }
  }
}

export const inr = (p: number) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: p % 100 ? 2 : 0, minimumFractionDigits: p % 100 ? 2 : 0 })
export const dayRange = (a: { from: string; to: string }) => {
  const f = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  return `${f(a.from)}–${f(a.to)}`
}
export const codWhyNotText = (w: CodWhyNot | null) => !w ? null
  : w.reason === 'off' ? 'This shop does not take Pay on delivery.'
  : w.reason === 'below_min' ? `Pay on delivery is for orders from ${inr(w.min)}.`
  : w.reason === 'above_max' ? `Pay on delivery is for orders up to ${inr(w.max)}. Pay online for this bag, or remove an item.`
  : `Pay on delivery is not offered to ${w.pincode}.`

/** The shopper's invoice PDF (Documents D2): POSTed with the order token, saved under the file name the shop gave it. */
/** How the order page names its order (src/lib/http/order-ref.ts). */
export type OrderRef = { token: string } | { o: string; e: string }

export async function downloadInvoice(ref: OrderRef): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/shop/orders/invoice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ref), cache: 'no-store' })
    if (!r.ok) return { ok: false, error: r.status === 429 ? 'Too many tries. Wait a few minutes.' : r.status === 404 ? 'Your invoice is not ready yet: it is made when your order is packed.' : 'We could not make your invoice. Try again in a minute.' }
    const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'Invoice.pdf'
    const url = URL.createObjectURL(await r.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.append(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return { ok: true }
  } catch {
    return { ok: false, error: 'No connection. Check your internet and try again.' }
  }
}
