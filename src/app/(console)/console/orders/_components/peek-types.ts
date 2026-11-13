/** What quick look shows (Neel N1c·4): words and figures built on the server, no cost of any kind. Its keys are pinned
 * by ../[number]/peek/__tests__ (a key added here must be added there on purpose). */
export type Peek = {
  number: string; href: string; state: { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }; payment: string
  customer: string; phone: string; address: string; erased: boolean; total: string; placed: string
  lines: { title: string; options: string; qty: number; price: string }[]
  events: { text: string; at: string }[]
}
export const PEEK_KEYS = ['number', 'href', 'state', 'payment', 'customer', 'phone', 'address', 'erased', 'total', 'placed', 'lines', 'events'] as const
