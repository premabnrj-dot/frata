import 'server-only'
import { cache } from 'react'
import { codeSource, type ManifestSource } from '@/domains/themes/source'

// =============================================================================
// FILE: src/lib/themes/manifests.ts — the ONE place a request gets its theme manifests (Theme Studio TS0a, ADR-0012).
// Read it BEFORE any transaction (never inside withTenant / asMember: P4) and pass it down to the pure functions.
// Today every shop reads the code catalogue; TS2 adds the studio versions this shop is entitled to, here and only here.
// =============================================================================

/** The manifests this shop may render, once per request (cached by its id: cache() matches arguments by identity). */
export const manifestsFor = cache(async (tenantId: string | null): Promise<ManifestSource> => {
  void tenantId
  return codeSource
})
