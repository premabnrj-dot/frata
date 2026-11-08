import { z } from 'zod'
import { Address, addressErrors } from '@/domains/checkout/address'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { Bag, Code, codeToTry, codeTried, publicQuote, reply, shopRequest } from '@/lib/http/shop-api'
import { placeOrder } from '@/lib/orders/place'

// Place an order. Limits fail closed here (a fake-COD script must not slip through a database hiccup).
const Body = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{22,43}$/), bag: Bag, address: z.unknown(), method: z.enum(['cod', 'prepaid']), expectedTotal: z.number().int().min(0), code: Code.optional(),
  facts: z.object({ firstMethod: z.enum(['cod', 'prepaid']).nullable().optional(), attribution: z.record(z.string().max(40), z.string().max(200)).optional() }).optional(),
})

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.placeOrderIp, true)
  if (!r.ok) return r.response
  const address = Address.safeParse(r.body.address)
  if (!address.success) return reply({ error: 'Some details need a look.', fields: addressErrors(address.error) }, 400)
  if (!(await withinLimit(LIMITS.placeOrderPhone, `${r.tenantId}:${address.data.phone}`, new Date(), true))) return reply({ error: 'Too many orders from this phone in the last hour. Message the shop on WhatsApp if you need help.' }, 429)
  const attribution = Object.fromEntries(Object.entries(r.body.facts?.attribution ?? {}).filter(([k]) => /^(utm_(source|medium|campaign|content|term)|fbclid|fbc|fbp|gclid)$/.test(k)))
  try {
    const code = await codeToTry(r.tenantId, r.ip, r.body.code)
    const out = await placeOrder(r.tenantId, { idempotencyKey: r.body.idempotencyKey, bag: r.body.bag, address: address.data, method: r.body.method, expectedTotal: r.body.expectedTotal, code, facts: { firstMethod: r.body.facts?.firstMethod ?? null, attribution } })
    // A code that did not apply counts against the guess limit here as on /quote (one rule: codeTried).
    await codeTried(r.tenantId, r.ip, r.body.code, !code ? 'not_applied' : out.kind === 'changed' ? out.quote.offers.code : out.kind === 'placed' ? out.code ?? 'applied' : 'applied')
    if (out.kind === 'changed') return reply({ changed: true, quote: publicQuote(out.quote) }, 409)
    if (out.kind === 'refused') return reply({ error: out.error, ...(out.quote ? { quote: publicQuote(out.quote) } : {}) }, out.status)
    return reply({ token: out.token, number: out.number, method: out.method, total: out.total, pay: out.pay, payError: out.payError ?? null })
  } catch (err) {
    console.error('[shop/orders] place', r.tenantId, err instanceof Error ? err.name : 'error')
    return reply({ error: 'We could not place the order. Nothing was charged. Try again.' }, 500)
  }
}
