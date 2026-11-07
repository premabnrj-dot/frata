// =============================================================================
// FILE: src/domains/checkout/address.ts
//
// WHAT A SHOPPER TYPES AT CHECKOUT, CHECKED — the same rules in the browser
// (inline) and on the server (the one that counts). Only what delivery needs
// (CCPA forced-action; DPDP purpose). Pure.
// =============================================================================

import { z } from 'zod'

/** States and union territories, as couriers and GST print them. */
export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
] as const

/** "+91 98290-43210", "098290 43210" → "9829043210"; null if it is not an Indian mobile number. */
export function cleanMobile(raw: string): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9][0-9]{9}$/.test(d) ? d : null
}

const text = (min: number, max: number, what: string) => z.string().transform((s) => s.trim().replace(/\s+/g, ' ')).pipe(z.string().min(min, what).max(max, `Up to ${max} characters.`))

export const Address = z.object({
  phone: z.string().transform((s, ctx) => cleanMobile(s) ?? (ctx.addIssue({ code: 'custom', message: 'A 10-digit mobile number.' }), z.NEVER)),
  name: text(2, 80, 'Your full name, as on the door.'),
  pincode: z.string().transform((s) => s.replace(/\s/g, '')).pipe(z.string().regex(/^[1-9][0-9]{5}$/, 'A 6-digit pincode.')),
  addressLine: text(5, 200, 'House number and street.'),
  area: text(2, 120, 'Area or locality.'),
  landmark: z.string().max(80, 'Up to 80 characters.').optional().default('').transform((s) => s.trim()),
  city: text(2, 60, 'Your town or city.'),
  state: z.enum(STATES, { message: 'Pick your state.' }),
})
export type AddressInput = z.input<typeof Address>
export type CleanAddress = z.output<typeof Address>

/** Field errors keyed by field name, in the shopper's words. */
export function addressErrors(e: z.ZodError): Record<string, string> {
  return Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? 'form'), i.message]))
}

/** "…3210" and "Jaipur 302001": what a forwarded order link may show (owner call 4). */
export const maskPhone = (p: string) => (p.length >= 4 ? `…${p.slice(-4)}` : '')
