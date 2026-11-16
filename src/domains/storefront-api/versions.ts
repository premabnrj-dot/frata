// =============================================================================
// FILE: src/domains/storefront-api/versions.ts
//
// THE STOREFRONT API'S VERSIONS (spec docs/specs/2026-11-11-storefront-api.md § 7): one list, newest last. A released
// version only grows (released-api.test.ts); a breaking change is a new dated version kept ≥ 12 months after its
// successor. The host routing, the WAF path rule and the route folders all read this list.
// =============================================================================

export const API_VERSIONS = ['2026-12'] as const
export type ApiVersion = (typeof API_VERSIONS)[number]
export const CURRENT_API_VERSION: ApiVersion = '2026-12'

/** A path on the API host that names a version this build serves: `/2026-12/…`. */
export const isVersionPath = (pathname: string) => API_VERSIONS.some((v) => pathname.startsWith(`/${v}/`))
