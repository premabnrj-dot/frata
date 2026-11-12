import type { OrderMessage } from '@/domains/messaging/events'

// =============================================================================
// FILE: src/domains/email/words.ts — FRRATA'S DEFAULT WORDS FOR EACH ORDER EMAIL (a shop may override any field in
// Settings › Emails to shoppers; "Revert to Frrata's words" returns here). Pure. English for now (spec § 8).
// =============================================================================

export type EmailWords = { subject: string; preview: string; heading: string; message: string; button: string }
export const WORD_FIELDS = ['subject', 'preview', 'heading', 'message', 'button'] as const satisfies readonly (keyof EmailWords)[]
export const WORD_LIMITS: Record<keyof EmailWords, number> = { subject: 120, preview: 140, heading: 80, message: 600, button: 30 }

export const DEFAULT_WORDS: Record<OrderMessage, EmailWords> = {
  confirmed: {
    subject: 'Order [Order number] is confirmed',
    preview: 'Thank you, [First name]',
    heading: 'Thank you, [First name]',
    message: "We've got your order and we're getting it ready. We'll write again when it ships.",
    button: 'See your order',
  },
  finish_paying: {
    subject: 'Your order [Order number] is waiting',
    preview: 'Finish paying to keep it',
    heading: 'Your order is waiting',
    message: "The payment didn't go through, so nothing was charged. Finish paying to keep your order, or choose pay on delivery.",
    button: 'Finish paying',
  },
  shipped: {
    subject: 'Order [Order number] is on its way',
    preview: 'Shipped with [Courier]',
    heading: "It's on its way",
    message: 'Your order has left us.\nTracking: [Tracking number]',
    button: 'Track your order',
  },
  delivered: {
    subject: 'Delivered · order [Order number]',
    preview: 'Your invoice is ready',
    heading: 'Delivered. Enjoy it, [First name]',
    message: 'Your tax invoice is ready on your order page.',
    button: 'See your invoice',
  },
  cancelled: {
    subject: 'Order [Order number] is cancelled',
    preview: "We're sorry",
    heading: 'Your order is cancelled',
    message: "If you paid online, the refund reaches you in 5–7 working days. Reply to this email if anything looks wrong.",
    button: 'See your order',
  },
  edited: {
    subject: 'Order [Order number] has changed',
    preview: 'Your new total is [Total]',
    heading: 'Your order has changed',
    message: "We've changed the items in your order, as below. Reply to this email if anything looks wrong.",
    button: 'See your order',
  },
}

export const EMAIL_NAMES: Record<OrderMessage, string> = {
  confirmed: 'Order confirmed', finish_paying: 'Finish paying', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', edited: 'Items changed',
}
