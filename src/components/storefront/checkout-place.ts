import { cleanMobile } from '@/domains/checkout/mobile'
import { cleanEmail } from '@/domains/email/shape'
import { inr, type PublicQuote } from './shop-client'

// Checkout's code for a tap on Place order and its refusals, loaded then, never on first paint (checkout's budget).

type Fields = { phone: string; email: string; name: string; pincode: string; addressLine: string; area: string; city: string; state: string }

/** The form's problems, by field id (the server checks again; Address in src/domains/checkout/address.ts). */
export function formErrors(f: Fields, deliversWithin: string | null, biz: { field: 'gstin' | 'name'; error: string } | null): Record<string, string> {
  const e: Record<string, string> = {}
  if (!cleanMobile(f.phone)) e.phone = 'A 10-digit mobile number.'
  if (f.email.trim() && !cleanEmail(f.email)) e.email = 'An email like name@example.com, or leave it empty.'
  if (f.name.trim().length < 2) e.name = 'Your full name, as on the door.'
  if (!/^[1-9][0-9]{5}$/.test(f.pincode)) e.pincode = 'A 6-digit pincode.'
  if (f.addressLine.trim().length < 5) e.addressLine = 'House number and street.'
  if (f.area.trim().length < 2) e.area = 'Area or locality.'
  if (f.city.trim().length < 2) e.city = 'Your town or city.'
  if (!f.state) e.state = 'Pick your state.'
  else if (deliversWithin && f.state !== deliversWithin) e.state = `This shop delivers within ${deliversWithin} only.`
  if (biz) e[biz.field === 'gstin' ? 'bizGstin' : 'bizName'] = biz.error
  return e
}

/** What changed since the shopper looked (a refused placement). */
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
