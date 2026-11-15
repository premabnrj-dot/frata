import 'server-only'
import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { keyShape, type KeyKind } from '@/domains/storefront-api/keys'
import { storefrontKeyRow } from '@/lib/db/platform'

// =============================================================================
// FILE: src/lib/queries/storefront-keys.ts — WHICH SHOP A STOREFRONT KEY NAMES (ADR-0018 § 7; V1 plan § SA0·4).
//
// Cached like hostFacts, keyed AND tagged by the key's sha256 in lowercase hex, which is known before the call (an
// `unstable_cache` tag must be: speed review H2). Its revalidate is the API's own hour (3600): Next lowers a cached
// route's period to the shortest cache it reads, so a shorter one here would rebuild every API copy that often
// (impact review 2026-11-15). Freshness comes from purges: a delete purges `skey:<hex>`, and every stop the definer
// derives (the store opens, the Website moves or its domain goes, a partner is removed) calls refreshKeys(shop)
// (src/lib/queries/storefront-api.ts), which purges the lookup AND every API copy read under it. A miss is never cached
// in the data cache (anyone can mint key shapes); this instance remembers it for 60 s so a repeat costs no definer
// call. A cached test key's end is checked again on every use. Only apiRequest calls this (check:tenant § 9).
// There is no withTenant here: the shop is not known yet; the definer is the one platform read (src/lib/db/platform.ts).
// =============================================================================

export type KeyRow = { keyId: string; tenantId: string; kind: KeyKind; expiresAt: string | null }
class Miss extends Error {}
const misses = new Map<string, number>()
export const keyHash = (key: string) => createHash('sha256').update(key).digest('hex')

export const storefrontKeyFor = cache(async (key: string): Promise<KeyRow | null> => {
  if (!keyShape(key)) return null
  const hex = keyHash(key)
  const now = Date.now() // clock-ok: server, a miss memo's age
  if ((misses.get(hex) ?? 0) > now) return null
  let row: KeyRow | null
  try {
    row = await unstable_cache(async () => { const r = await storefrontKeyRow(hex); if (!r) throw new Miss(); return r }, ['skey-v1', hex], { tags: [`skey:${hex}`], revalidate: 3600 })()
  } catch (e) {
    if (!(e instanceof Miss)) throw e
    row = null
  }
  if (!row || (row.expiresAt && Date.parse(row.expiresAt) <= now)) {
    if (misses.size > 10_000) misses.clear()
    misses.set(hex, now + 60_000)
    return null
  }
  return row
})
