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
  ndr: { label: 'Delivery failed', tone: 'danger' },
  delivered: { label: 'Delivered', tone: 'ok' },
  rto: { label: 'Returning', tone: 'danger' },
  rto_received: { label: 'Returned', tone: 'neutral' },
}

/** How it is paid now (currentMethod), and whether the online payment came in. */
export const PAYMENT = { cod: { label: 'COD', tone: 'warn' as Tone }, paid: { label: 'Paid online', tone: 'ok' as Tone }, unpaid: { label: 'Online, not paid', tone: 'neutral' as Tone } }

/** The queue's views, and what each says when nothing waits in it (an empty state per tab, design-language § Work queues 8). */
export const TABS: { tab: QueueTab; label: string; empty: { title: string; body?: string } }[] = [
  { tab: 'to_confirm', label: 'To confirm', empty: { title: 'Nothing to confirm', body: 'New pay-on-delivery orders land here.' } },
  { tab: 'to_pack', label: 'To pack', empty: { title: 'Nothing to pack', body: 'Confirmed orders and orders paid online land here.' } },
  { tab: 'on_hold', label: 'On hold', empty: { title: 'Nothing on hold' } },
  { tab: 'all', label: 'All', empty: { title: 'No orders yet', body: 'Orders from your shop appear here as they are placed.' } },
  { tab: 'not_paid', label: 'Not paid online', empty: { title: 'No unpaid online orders', body: 'An online order that is never paid holds its stock for 20 minutes, then lets it go.' } },
]

export const RISK_LABEL = { medium: 'Medium', high: 'High' } as const
