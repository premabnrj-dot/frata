import 'server-only'
import { hashes, keyedHash, parseRing } from '@/lib/crypto/key-ring'
import { inboxOf } from '@/domains/email/shape'
import { EMAIL_KEYS } from '@/lib/env'

// =============================================================================
// FILE: src/lib/email/hash.ts — THE ONE OWNER OF AN ADDRESS'S SUPPRESSION HASH (security review L2; tenancy M):
// HMAC under EMAIL_KEYS over (tenant ‖ address), so the same shopper hashes differently in every shop and no two
// shops' lists can be joined. "<key id>:<hex>"; a lookup tries every live key (rotation).
// =============================================================================

const ring = () => parseRing(EMAIL_KEYS)

export function suppressionHashes(tenantId: string, address: string): { write: string; lookup: string[] } | null {
  const r = ring()
  if (!r.length) return null
  return hashes(r, 'email-suppression', `${tenantId}|${address.trim().toLowerCase()}`)
}

/** The subject a mail limit counts (security review E·2 M2, L4): one inbox however it is spelt, keyed, so the limits
 *  table can't be checked against a list of addresses. No key → the inbox itself (the table holds only its sha256). */
export function inboxLimitKey(clean: string): string {
  const k = ring()[0]
  return k ? keyedHash(k, 'email-limit', inboxOf(clean)) : inboxOf(clean)
}

/** An email consent's address (customer_consents.address_hash): per shop, like a suppression, under its own purpose. */
export function consentHashes(tenantId: string, address: string): { write: string; lookup: string[] } | null {
  const r = ring()
  if (!r.length) return null
  return hashes(r, 'email-consent', `${tenantId}|${address.trim().toLowerCase()}`)
}
