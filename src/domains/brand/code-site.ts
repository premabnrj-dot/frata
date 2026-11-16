// =============================================================================
// FILE: src/domains/brand/code-site.ts — WHICH STORES HAVE A BRAND RECORD (one-address plan P1; spec § 5, "a store
// with a code site, or one being built"; owner decision 19: theme shops keep their look). Pure.
// =============================================================================

/**
 * A store has a code site when its Website is its own (`shop_settings.site_origin`), or while one is built: it holds a
 * Storefront API key that is not deleted and not expired (`liveKeys`, counted by the caller with that rule). Those
 * stores get Console › Brand in Look's place; every other store keeps Look.
 */
export function hasCodeSite(f: { siteOrigin: string | null; liveKeys: number }): boolean {
  return f.siteOrigin !== null || f.liveKeys > 0
}
