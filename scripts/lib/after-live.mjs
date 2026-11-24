// =============================================================================
// FILE: scripts/lib/after-live.mjs — which migrations are applied only once the new build is live.
//
// A contract migration (frata-architecture § Definers: expand-then-contract) starts with the line `-- apply: after-live`:
// it drops what the old build still calls, so it goes to production only after the build that stopped calling it serves
// (docs/setup.md § Migrations after live). `scripts/prod-migrate.mjs` refuses to print one unless asked by name with
// `--after-live`; `npm run release:check` (merge-main.mjs --check) names every one.
// =============================================================================
import { readdirSync, readFileSync } from 'node:fs'

export const AFTER_LIVE = '-- apply: after-live'

/** The migration's FIRST line is the marker (a line further down, or in a comment's words, is not). */
export const isAfterLive = (sql) => sql.split('\n', 1)[0].trim() === AFTER_LIVE

/** Every after-live migration in `dir`, in number order. */
export function afterLiveMigrations(dir = 'drizzle') {
  return readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort().filter((f) => isAfterLive(readFileSync(`${dir}/${f}`, 'utf8')))
}
