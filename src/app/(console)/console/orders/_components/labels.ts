// =============================================================================
// FILE: src/app/(console)/console/orders/_components/labels.ts
//
// What a merchant reads for an order's state and how it is paid — ONE copy,
// read by the queue (1D·4b) and the order page (1D·4c). A plain module (not
// 'use client'), so server and client components both import it. Two badges,
// never merged: how it is paid, and where it is (design-language § Work
// queues 1).
// =============================================================================
import type { OrderState, QueueTab } from '@/domains/orders/order-state'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

export const STATE: Record<OrderState, { label: string; tone: Tone }> = {
  awaiting_payment: { label: 'Paying now', tone: 'neutral' },
  payment_abandoned: { label: 'Payment abandoned', tone: 'neutral' },
  unconfirmed: { label: 'To confirm', tone: 'warn' },
  held: { label: 'On hold', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  paid: { label: 'To pack', tone: 'info' },
  refund_due: { label: 'Refund due', tone: 'danger' },
  packed: { label: 'Packed', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  shipped: { label: 'Shipped', tone: 'info' },
  ndr: { label: "Couldn't deliver", tone: 'danger' },
  delivered: { label: 'Delivered', tone: 'ok' },
  rto: { label: 'Coming back', tone: 'danger' },
  rto_received: { label: 'Came back', tone: 'neutral' },
  lost: { label: 'Lost by the courier', tone: 'danger' },
}

/** How it is paid now (currentMethod), and whether the online payment came in. */
// How it is paid is a neutral badge with its icon; only the order's STATE is coloured, so "COD" and "To confirm" no
// longer read as one yellow axis (visual changes, owner-approved 2026-11-08).
export const PAYMENT = {
  cod: { label: 'COD', tone: 'neutral' as Tone, icon: 'cod' as const },
  paid: { label: 'Paid online', tone: 'neutral' as Tone, icon: 'prepaid' as const },
  unpaid: { label: 'Online, not paid', tone: 'neutral' as Tone, icon: 'prepaid' as const },
}

/** The queue's views, and what each says when nothing waits in it (an empty state per tab, design-language § Work queues 8). */
export const TABS: { tab: QueueTab; label: string; empty: { title: string; body?: string } }[] = [
  { tab: 'to_confirm', label: 'To confirm', empty: { title: 'Nothing to confirm', body: 'New pay-on-delivery orders land here.' } },
  { tab: 'to_pack', label: 'To pack', empty: { title: 'Nothing to pack', body: 'Confirmed orders and orders paid online land here.' } },
  { tab: 'to_ship', label: 'To ship', empty: { title: 'Nothing to ship', body: 'Packed orders land here until they leave the shop.' } },
  { tab: 'on_the_way', label: 'On the way', empty: { title: 'Nothing on the way', body: 'Shipped orders wait here for Delivered or Came back.' } },
  { tab: 'couldnt_deliver', label: "Couldn't deliver", empty: { title: 'No failed deliveries', body: 'When the courier cannot deliver, the order lands here to act on the same day.' } },
  { tab: 'coming_back', label: 'Coming back', empty: { title: 'Nothing coming back' } },
  { tab: 'on_hold', label: 'On hold', empty: { title: 'Nothing on hold' } },
  { tab: 'all', label: 'All', empty: { title: 'No orders yet', body: 'Orders from your shop appear here as they are placed.' } },
  { tab: 'not_paid', label: 'Not paid online', empty: { title: 'No unpaid online orders', body: 'An online order that is never paid holds its stock for 20 minutes, then lets it go.' } },
]

export const RISK_LABEL = { medium: 'Medium', high: 'High' } as const

/** The order's history in words (order_events: field names only, so the words never quote a value). */
const FIELD_LABEL: Record<string, string> = {
  customerName: 'name', phone: 'phone', addressLine: 'address', area: 'area', landmark: 'landmark', pincode: 'pincode', city: 'city', state: 'state',
}
export function eventLabel(e: { kind: string; reason: string | null; fields: string[] | null }, cancelLabel: (r: string) => string): string {
  switch (e.kind) {
    case 'confirmed': return e.reason === 'from_hold' ? 'Confirmed (was on hold)' : 'Confirmed'
    case 'held': return 'Put on hold'
    case 'unheld': return 'Taken off hold'
    case 'undone': return e.reason === 'held' ? 'Undid the hold' : e.reason === 'unheld' ? 'Put back on hold'
      : e.reason === 'shipped' ? 'Undid Shipped' : e.reason === 'delivered' ? 'Undid Delivered' : e.reason === 'rto' ? 'Undid Came back' : e.reason === 'lost' ? 'Undid Lost' : 'Undid the confirmation'
    case 'shipped': return 'Shipped'
    case 'delivered': return 'Delivered'
    case 'rto': return e.reason === 'restocked' ? 'Came back · stock put back' : 'Came back'
    case 'lost': return 'Lost by the courier'
    case 'edited': return `Changed the ${(e.fields ?? []).map((f) => FIELD_LABEL[f] ?? f).join(', ')}`
    case 'packed': return 'Packed · invoice issued'
    case 'cancelled': return `Cancelled · ${e.reason ? cancelLabel(e.reason) : 'no reason given'}`
    case 'note_added': return 'Added a note'
    default: return e.kind.replace(/_/g, ' ')
  }
}

/** The print page for one order or a selection (numbers without the shop's prefix; at most 50 are printed). */
export const printHref = (kind: 'slip' | 'invoice', numbers: number[]) => `/console/orders/print?kind=${kind}&n=${numbers.join(',')}`
