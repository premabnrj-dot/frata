// =============================================================================
// FILE: src/lib/db/url.ts
//
// Checks DATABASE_URL and returns it, or throws an error that says what is
// wrong WITHOUT the value — a connection string is a secret, and an error is
// logged. Pure, so it is tested without a database.
// =============================================================================

export function parseDatabaseUrl(raw: string): string {
  if (!raw) throw new Error('[db] DATABASE_URL is not set')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(
      '[db] DATABASE_URL is not a valid URL. A password with / + @ : or # must be ' +
      'percent-encoded — or use a hex password (openssl rand -hex 24).',
    )
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`[db] DATABASE_URL must start with postgresql:// (got ${url.protocol}//)`)
  }
  // The app must log in as frata_app (ADR-0002); postgres bypasses every policy.
  const user = decodeURIComponent(url.username)
  if (!/^frata_app(\.[a-z0-9]+)?$/.test(user)) {
    throw new Error('[db] DATABASE_URL must log in as frata_app.<project-ref>, not another role')
  }
  return raw
}
