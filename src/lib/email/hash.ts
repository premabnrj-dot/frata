import 'server-only'
import { hashes, parseRing } from '@/lib/crypto/key-ring'
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
