// =============================================================================
// FILE: src/domains/storefront-api/origin.ts
//
// THE WEBSITE'S ORIGIN, as the API's answers address it (G·4, G15; orchestrator ruling C6, 2026-11-22): the brand's own
// Website when Settings › Website names one, else the store's own address on Frrata. One pure function, so that P5·2
// can move it behind the website predicate (app_website_of, ADR-0019 point 3) in one place. Pure.
// =============================================================================

/** `site`: shop_settings.site_origin (https, set only on a live connected domain). `checkout`: https://<store host>. */
export const websiteOrigin = (site: string | null, checkout: string): string => site ?? checkout
