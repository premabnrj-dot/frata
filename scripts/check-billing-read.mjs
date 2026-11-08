// =============================================================================
// GATE check:billing-read (billing B1; plan finding 9): only the Plan and billing pages may import the shop's money
// reads (src/lib/queries/billing.ts). Its exports refuse anyone outside owner and admin, and this keeps every other
// console page, the storefront and the shop API from reaching them at all. Comment lines are skipped.
// =============================================================================
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The console's billing banner (owners and admins only, plan finding 9) is the one reader outside the billing pages.
const ALLOWED = [/^src\/app\/\(console\)\/console\/settings\/billing\//, /^src\/app\/\(console\)\/console\/_components\/billing-banner\.tsx$/, /^src\/lib\/queries\/billing\.ts$/, /\/__tests__\//]
const IMPORT = /(?:from\s+|import\(\s*)['"]@\/lib\/queries\/billing['"]/
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n).replaceAll('\\', '/'); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [] })
const bad = walk('src').filter((f) => !ALLOWED.some((re) => re.test(f)))
  .filter((f) => readFileSync(f, 'utf8').split(/\r?\n/).some((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && IMPORT.test(l)))
if (bad.length) { console.error(`check:billing-read — billing reads imported outside console/settings/billing:\n  ${bad.join('\n  ')}`); process.exit(1) }
console.log('check:billing-read — clean')
