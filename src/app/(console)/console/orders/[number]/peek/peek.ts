import 'server-only'
import { orderState, paymentKind } from '@/domains/orders/order-state'
import { CANCEL_LABEL, type CancelReason } from '@/domains/orders/work'
import { paise } from '@/domains/money/paise'
import { formatInr, formatPhone } from '@/lib/format'
import { dateTimeIN } from '@/lib/format-date'
import type { peekOrder } from '@/lib/queries/orders'
import { eventLabel, PAYMENT, STATE } from '../../_components/labels'
import type { Peek } from '../../_components/peek-types'

/** The quick look of one order, in words (named fields only: the reply never carries a column it was not built from). */
export function toPeek(r: NonNullable<Awaited<ReturnType<typeof peekOrder>>>, prefix: string, now: Date): Peek {
  const o = r.order
  const erased = o.erasedAt !== null
  return {
    number: `${prefix}-${o.number}`, href: `/console/orders/${o.number}`, state: STATE[orderState(o, now)], payment: PAYMENT[paymentKind(o)].label,
    customer: erased ? 'Erased' : o.customerName, phone: erased || !o.phone ? '' : formatPhone(o.phone),
    address: erased ? '' : [o.addressLine, o.area, o.landmark, o.city, [o.state, o.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    erased, total: formatInr(paise(Number(o.total))), placed: dateTimeIN(o.placedAt),
    lines: r.lines.map((l) => ({ title: l.title, options: l.options.join(' · '), qty: l.qty, price: formatInr(paise(Number(l.unitPrice))) })),
    events: r.events.map((e) => ({ text: eventLabel(e, (x) => CANCEL_LABEL[x as CancelReason] ?? x), at: dateTimeIN(e.at) })),
  }
}
