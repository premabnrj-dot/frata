import type { OrderState } from './order-state'

// =============================================================================
// FILE: src/domains/orders/state-words.ts — AN ORDER'S STATE IN THE CONSOLE'S WORDS, ONE COPY (Neel N3, § Glossary:
// order states). The queue's badges (orders/_components/labels.ts adds their tones) and the refusals in
// src/lib/orders read these, so a refusal never shows a code word ("ndr", "awaiting payment").
// =============================================================================
export const STATE_WORDS: Record<OrderState, string> = {
  awaiting_payment: 'Paying now',
  payment_abandoned: 'Payment abandoned',
  unconfirmed: 'To confirm',
  held: 'On hold',
  confirmed: 'To pack',
  paid: 'To pack',
  refund_due: 'Refund due',
  packed: 'Packed',
  cancelled: 'Cancelled',
  shipped: 'On the way',
  ndr: 'Couldn’t deliver',
  delivered: 'Delivered',
  rto: 'Coming back',
  rto_received: 'Came back',
  lost: 'Lost by the courier',
}
