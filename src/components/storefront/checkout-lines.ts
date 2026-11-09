import 'server-only'

/** The checkout's returns line (English: the checkout is English, its words legal-adjacent). One home: the shop's
 *  checkout page and the customizer's preview of it. */
const RETURNS: Record<string, (d: number) => string | null> = { exchange_or_refund: (d) => `${d}-day returns and exchanges`, exchange_only: (d) => `${d}-day exchanges`, refund_only: (d) => `${d}-day returns`, none: () => null }
export const checkoutReturnLine = (kind: string, days: number) => RETURNS[kind]?.(days) ?? null
