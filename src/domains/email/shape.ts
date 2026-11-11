// =============================================================================
// FILE: src/domains/email/shape.ts — THE ONE EMAIL-ADDRESS RULE (checkout, Edit contact, test sends). Pure. The SQL CHECK
// on orders.email states the same shape; a test keeps the two in step (plan 2026-11-11-email, decision 5; L3).
// =============================================================================

/** Trimmed, lower-cased; ≤ 254, local part ≤ 64; printable ASCII only; one @; a dot in the domain. */
export const EMAIL_SQL = "^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(\\.[a-z0-9-]+)+$"
const SHAPE = new RegExp(EMAIL_SQL)

export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  if (!v || v.length > 254 || !SHAPE.test(v)) return null
  const domain = v.slice(v.indexOf('@') + 1)
  if (domain.split('.').some((p) => !p || p.startsWith('-') || p.endsWith('-'))) return null
  return v
}

/** "asha.rao@gmail.com" → "as•••@gmail.com", as the order page masks a phone. */
export function maskEmail(v: string): string {
  const at = v.indexOf('@')
  if (at < 1) return '•••'
  return `${v.slice(0, Math.min(2, at))}•••${v.slice(at)}`
}
