import 'server-only'
import { returnsWords } from '@/domains/brand/checkout'

/** The checkout's returns line (English: the checkout is English, its words legal-adjacent): the shop's checkout page
 *  and the customizer's preview of it. Its words live with the trust block's (src/domains/brand/checkout.ts). */
export const checkoutReturnLine = (kind: string, days: number) => returnsWords(kind, days, 'line')
