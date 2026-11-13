import 'server-only'
import type { MemberRole } from '@/domains/tenancy/roles'
import { orderState, paidAfterSwitch, paymentKind } from '@/domains/orders/order-state'
import { parseOrderSearch } from '@/domains/orders/search'
import { placeLine } from '@/domains/orders/place-line'
import { risk } from '@/domains/orders/risk'
import { applies, may } from '@/domains/orders/work'
import { dateTimeIN } from '@/lib/format-date'
import type { ordersPage } from '@/lib/queries/orders'
import { PAYMENT, STATE } from './labels'
import type { QueueRow } from './queue'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/rows.ts — THE QUEUE'S ROWS, ONE COPY (Neel N1c).
//
// What a row shows and offers, built on the server from one ordersPage read: the Orders page and the instant-search
// route (../rows/route.ts) both call this, so a row found as you type is the row the page would render. Risk is for
// orders still to be decided; facts unreadable → "Risk unavailable" (and c opens instead of confirming).
// =============================================================================

type Page = Awaited<ReturnType<typeof ordersPage>>

export function toRows({ list, facts, prefix }: Page, q: string, role: MemberRole, now: Date): QueueRow[] {
  const search = parseOrderSearch(q)
  return list.map((o) => {
    const state = orderState(o, now)
    const f = facts?.get(o.id)
    const number = `${prefix}-${o.number}`
    const matched: QueueRow['matched'] = !search ? null
      : o.awb ? { field: 'awb', text: o.awb }
        : search.phoneDigits && o.phone?.includes(search.phoneDigits) ? { field: 'phone', text: o.phone }
          : search.number === o.number ? { field: 'number', text: number }
            : search.like ? { field: 'name', text: o.customerName } : null
    return {
      id: o.id, n: o.number, number, href: `/console/orders/${o.number}`,
      customer: o.customerName, place: placeLine(o.city, o.items),
      payment: PAYMENT[paymentKind(o)], state: STATE[state], doNotCollect: paidAfterSwitch(o),
      risk: state === 'unconfirmed' || state === 'held' ? (facts === null ? 'unknown' : f ? risk(f).level : 'low') : 'low',
      canConfirm: applies('confirm', state), canHold: applies('hold', state), canPrint: applies('print', state),
      total: Number(o.total), placed: dateTimeIN(o.placedAt), dimmed: STATE[state].tone === 'neutral',
      shipStep: o.byCourier ? null : may('ship_self', state, role) ? 'ship' : may('deliver', state, role) ? 'deliver' : null,
      matched,
    }
  })
}
