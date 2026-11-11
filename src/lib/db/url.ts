// =============================================================================
// FILE: src/lib/db/url.ts
//
// Checks a connection URL and the ROLE it logs in as, and returns it — or throws
// an error that says what is wrong WITHOUT the value: a connection string is a
// secret, and an error is logged. Each connection names the role it must be:
// the app is frata_app, Admin is frata_admin (ADR-0007). Pointing DATABASE_URL
// at frata_admin would give the storefront every admin policy; this refuses it.
// =============================================================================

export type DbRole = 'frata_app' | 'frata_admin'

/** parseDatabaseUrl's own refusal: its message names the setting and the rule, never the value. */
export class DbUrlError extends Error { override name = 'DbUrlError' }

/** What parseDatabaseUrl refused, said safely (only its own error class, so no other message ever reaches a log; owner,
 *  2026-11-11: a bare "Error" hid which rule failed). '' for any other error. */
export const urlProblem = (e: unknown): string => (e instanceof DbUrlError ? e.message : '')

export function parseDatabaseUrl(raw: string, role: DbRole = 'frata_app', name = 'DATABASE_URL'): string {
  if (!raw) throw new DbUrlError(`[db] ${name} is not set`)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new DbUrlError(
      `[db] ${name} is not a valid URL. A password with / + @ : or # must be ` +
      'percent-encoded — or use a hex password (openssl rand -hex 24).',
    )
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new DbUrlError(`[db] ${name} must start with postgresql:// (got ${url.protocol}//)`)
  }
  const user = decodeURIComponent(url.username)
  if (!new RegExp(`^${role}(\\.[a-z0-9]+)?$`).test(user)) {
    throw new DbUrlError(`[db] ${name} must log in as ${role}.<project-ref>, not another role`)
  }
  return raw
}
