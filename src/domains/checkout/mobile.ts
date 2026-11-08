// =============================================================================
// FILE: src/domains/checkout/mobile.ts — a shopper's mobile number, with no zod (speed review P14: the console's
// order page imported cleanMobile from address.ts and shipped zod, 25 kB, to the browser for one function). Pure.
// =============================================================================

/** "+91 98290-43210", "098290 43210" → "9829043210"; null if it is not an Indian mobile number. */
export function cleanMobile(raw: string): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9][0-9]{9}$/.test(d) ? d : null
}

export const maskPhone = (p: string) => (p.length >= 4 ? `…${p.slice(-4)}` : '')
