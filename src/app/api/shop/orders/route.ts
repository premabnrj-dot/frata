import { sessionToken as customerSessionToken } from '@/lib/ekcode/handshake'
import { z } from 'zod'
import { Address, addressErrors } from '@/domains/checkout/address'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { Bag, Code, codeToTry, codeTried, publicQuote, reply, shopRequest } from '@/lib/http/shop-api'
import { placeOrder } from '@/lib/orders/place'
import { cleanAttribution } from '@/domains/analytics/attribution'
import { CONSOLE_HOST, SHOP_DOMAIN } from '@/lib/public-env'
import { drainSoon } from '@/lib/outbox/drain'

// Place an order. Limits fail closed here (a fake-COD script must not slip through a database hiccup).
const Body = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{22,43}$/), bag: Bag, address: z.unknown(), method: z.enum(['cod', 'prepaid']), expectedTotal: z.number().int().min(0), code: Code.optional(), via: z.enum(['typed', 'link']).optional(),
  // Attribution as the shop's capture kept it: anything (junk in sessionStorage never stops an order); cleanAttribution
  // keeps the listed keys only, and the 32 kB body cap bounds the size.
  facts: z.object({ firstMethod: z.enum(['cod', 'prepaid']).nullable().optional(), attribution: z.unknown().optional(), ekcode: z.enum(['shown', 'held']).nullable().optional() }).optional(),
  // A business buyer's GST invoice (checked again in placeOrder: tax/gstin.ts). Capped here.
  b2b: z.object({ gstin: z.string().max(20), name: z.string().max(120) }).nullable().optional(),
  // The WhatsApp opt-in: only `true` counts (an absent or false box is no consent).
  waOptIn: z.boolean().optional(),
})

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.placeOrderIp, true)
  if (!r.ok) return r.response
  const address = Address.safeParse(r.body.address)
  if (!address.success) return reply({ error: 'Some details need a look.', fields: addressErrors(address.error) }, 400)
  // An email given at checkout: per shop and across shops, failing closed (email plan, security review H4). Over the
  // limit the order still goes through, without the email: an order never waits on a mail rule.
  if (address.data.email && !(await withinLimit(LIMITS.orderEmailShop, `${r.tenantId}:${address.data.email}`, new Date(), true)
    && await withinLimit(LIMITS.orderEmailGlobal, address.data.email, new Date(), true))) address.data.email = null
  if (!(await withinLimit(LIMITS.placeOrderPhone, `${r.tenantId}:${address.data.phone}`, new Date(), true))) return reply({ error: 'Too many orders from this phone in the last hour. Message the shop on WhatsApp if you need help.' }, 429)
  // The one cleaner (domains/analytics): listed keys only, each cleaned; the referring site reduced to a hostname that is
  // not this shop (the request's own host), any shop on the shop domain, the console, a payment page or an IP.
  const host = (request.headers.get('host') ?? '').toLowerCase().replace(/:\d+$/, '')
  const attribution = cleanAttribution(r.body.facts?.attribution, { ownHosts: [host, host.replace(/^www\./, ''), `www.${host.replace(/^www\./, '')}`], shopDomain: SHOP_DOMAIN, consoleHost: CONSOLE_HOST })
  try {
    const code = await codeToTry(r.tenantId, r.ip, r.body.code)
    const out = await placeOrder(r.tenantId, { host: r.host, idempotencyKey: r.body.idempotencyKey, bag: r.body.bag, address: address.data, method: r.body.method, expectedTotal: r.body.expectedTotal, code, via: r.body.via, b2b: r.body.b2b ?? null, waOptIn: r.body.waOptIn === true, facts: { firstMethod: r.body.facts?.firstMethod ?? null, attribution, ekcode: r.body.facts?.ekcode ?? null }, session: await customerSessionToken() })
    // A code that did not apply counts against the guess limit here as on /quote (one rule: codeTried).
    await codeTried(r.tenantId, r.ip, r.body.code, !code ? 'not_applied' : out.kind === 'changed' ? out.quote.offers.code : out.kind === 'placed' ? out.code ?? 'applied' : 'applied')
    if (out.kind === 'changed') return reply({ changed: true, quote: publicQuote(out.quote) }, 409)
    if (out.kind === 'refused') return reply({ error: out.error, ...(out.quote ? { quote: publicQuote(out.quote) } : {}) }, out.status)
    drainSoon() // the order email (email E·2), sent after the response
    return reply({ token: out.token, number: out.number, method: out.method, total: out.total, pay: out.pay, payError: out.payError ?? null })
  } catch (err) {
    console.error('[shop/orders] place', r.tenantId, err instanceof Error ? err.name : 'error')
    return reply({ error: 'We could not place the order. Nothing was charged. Try again.' }, 500)
  }
}
