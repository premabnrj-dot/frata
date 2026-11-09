// =============================================================================
// FILE: src/domains/addresses/domain-input.ts — WHAT A PERSON TYPED, TIDIED (D2·3; design rule 73).
// Client-safe and tiny: the Connect dialog shows `https://www.KesarStudio.in/` as `www.kesarstudio.in` while it is
// typed. Deciding whether it can be connected (and whether it is the apex) is the server's: domains.ts.
// =============================================================================

/** Lowercase, without a scheme, path, query, fragment or trailing dot. Never adds or removes `www.` (the server does). */
export function tidyDomain(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 300)
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.+$/, '')
}
