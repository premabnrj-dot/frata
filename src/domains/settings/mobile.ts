// An Indian mobile number as Settings stores it (10 digits), in its own module so a shop's browser code (the order
// page's WhatsApp link) takes it without the rest of Settings. Pure.

const MOBILE = /^[6-9][0-9]{9}$/
/** "+91 98270-41000" → "9827041000"; null when it is not an Indian mobile number. */
export function normaliseMobile(raw: string): string | null {
  const d = raw.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')
  return MOBILE.test(d) ? d : null
}
