// Why pay on delivery is not offered, in the shopper's words: server-side copy (checkout's quote reply, the console's
// preview). Apart from delivery.ts so the product page's script never carries these sentences (storefront JS budget).

import type { Cod } from '@/domains/delivery/floor'

/** Why Pay on delivery is not offered, in the shopper's words. */
export function codWhyNot(c: Cod, inr: (paise: number) => string): string | null {
  if (c.offered) return null
  if (c.reason === 'off') return 'This shop does not take Pay on delivery.'
  if (c.reason === 'below_min') return `Pay on delivery is for orders from ${inr(c.min)}.`
  if (c.reason === 'above_max') return `Pay on delivery is for orders up to ${inr(c.max)}. Pay online for this bag.`
  if (c.reason === 'not_delivered') return 'This shop does not deliver to this PIN code yet.'
  if (c.reason === 'prepaid_only') return `Pay online for ${c.pincode}.`
  return `Pay on delivery is not offered to ${c.pincode}.`
}
