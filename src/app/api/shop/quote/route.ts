import { z } from 'zod'
import { quote } from '@/domains/checkout/quote'
import { LIMITS } from '@/lib/db/rate-limit'
import { Bag, Code, codeToTry, codeTried, publicQuote, reply, shopRequest } from '@/lib/http/shop-api'
import { quoteData } from '@/lib/queries/checkout'

// The bag's price right now, from the server's rows (the bag drawer, /bag and checkout all ask here). Writes nothing.
const Body = z.object({ bag: Bag, pincode: z.string().regex(/^[1-9][0-9]{5}$/).optional(), code: Code.optional() })

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.quoteIp)
  if (!r.ok) return r.response
  const now = new Date()
  const { shop, rows, offers } = await quoteData(r.tenantId, r.body.bag.map((b) => b.variantId), now)
  if (!shop?.open) return reply({ error: 'This shop is not taking orders right now.' }, 404)
  const code = await codeToTry(r.tenantId, r.ip, r.body.code)
  const q = quote(r.body.bag, rows, shop, now, r.body.pincode, { offers, code })
  // A typed code that was not tried (too many guesses) reads exactly like one that does not apply.
  const result = r.body.code ? (code ? q.offers.code : 'not_applied') : null
  await codeTried(r.tenantId, r.ip, r.body.code, result)
  return reply({ quote: { ...publicQuote(q), offers: { ...publicQuote(q).offers, code: result } }, online: shop.online })
}
