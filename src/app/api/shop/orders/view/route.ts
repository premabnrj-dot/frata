import { z } from 'zod'
import { collect, savingsAsPaid } from '@/domains/orders/amounts'
import { currentMethod, orderState, paidAfterSwitch, shopperState } from '@/domains/orders/order-state'
import { maskPhone } from '@/domains/checkout/address'
import { LIMITS } from '@/lib/db/rate-limit'
import { withTenant } from '@/lib/db/tenant'
import { tokenHash } from '@/lib/crypto/secret-box'
import { reply, shopRequest, Token } from '@/lib/http/shop-api'
import { checkoutShop, orderPage } from '@/lib/queries/checkout'
import { processEvents } from '@/lib/orders/payment'

// The shopper's order page data. The token comes in the body (it lives in the URL's #fragment, so no log or cache
// ever holds it); a wrong shop and a missing order answer the same 404. Address and phone are masked (owner call 4).
const Body = z.object({ token: Token })

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.payIp)
  if (!r.ok) return r.response
  await processEvents(r.tenantId).catch(() => 0)
  const data = await withTenant(r.tenantId, async (tx) => ({ o: await orderPage(tx, r.tenantId, tokenHash(r.body.token)), shop: await checkoutShop(tx, r.tenantId, null) }))
  if (!data.o || !data.shop) return reply({ error: 'Not found' }, 404)
  const o = data.o
  return reply({
    // Never the internal state (held, refund due) or why an order was cancelled: shopperState() only.
    number: o.number, state: shopperState(orderState(o, new Date())), collect: collect(o), method: currentMethod(o), paidAfterSwitch: paidAfterSwitch(o), canSwitchToCod: o.paymentMethod === 'prepaid' && !o.paidAt && !o.switchedToCodAt && !o.cancelledAt,
    subtotal: o.subtotal, shipping: o.shipping, codCharge: o.codCharge, gstTotal: o.gstTotal, total: o.total, pricesIncludeGst: o.pricesIncludeGst,
    firstName: o.customerName.split(' ')[0] ?? '', to: `${o.city} ${o.pincode}`.trim(), phone: maskPhone(o.phone),
    arrives: o.arrivesFrom && o.arrivesTo ? { from: o.arrivesFrom, to: o.arrivesTo } : null, returnDays: o.returnDays, returnKind: o.returnKind,
    lines: o.lines, shop: { name: data.shop.name, whatsapp: data.shop.whatsapp }, invoice: !!o.packedAt,
    // What the offers saved on the items, as the order is paid now (the pay-online saving only while paid online).
    savings: savingsAsPaid(o.offers, currentMethod(o)).map((d) => ({ title: d.title, amount: d.amount })),
  })
}
