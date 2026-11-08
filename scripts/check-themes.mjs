// check:themes — a released theme manifest never changes (themes plan T3·5).
//
// src/domains/themes/catalogue/released.json holds the sha256 of every manifest file (<theme>/<semver>.ts). A
// shop's look names a theme and a version; if that version's file changed, the shop's look would change under it
// without a publish. So: a listed file whose bytes changed fails, and a manifest file not listed fails. A new
// version is a new file, added with `npm run themes:lock` (which never rewrites a listed one).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/domains/themes/catalogue'
const LOCK = join(DIR, 'released.json')
const VERSION = /^\d+\.\d+\.\d+\.ts$/
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')

const files = readdirSync(DIR).filter((d) => statSync(join(DIR, d)).isDirectory())
  .flatMap((d) => readdirSync(join(DIR, d)).filter((f) => VERSION.test(f)).map((f) => `${d}/${f}`)).sort()
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {}

if (process.argv.includes('--lock')) {
  let added = 0
  for (const f of files) if (!lock[f]) { lock[f] = sha(join(DIR, f)); added++ }
  writeFileSync(LOCK, JSON.stringify(Object.fromEntries(Object.entries(lock).sort()), null, 2) + '\n')
  console.log(`themes:lock — ${added} new version(s) listed; listed ones unchanged`)
  process.exit(0)
}

const problems = []
for (const f of files) {
  if (!lock[f]) problems.push(`${f}: not in released.json. A new version? Run npm run themes:lock.`)
  else if (lock[f] !== sha(join(DIR, f))) problems.push(`${f}: changed after it was listed. Shops on this version would change without a publish: add a new version file instead.`)
}
for (const f of Object.keys(lock)) if (!files.includes(f)) problems.push(`${f}: listed but gone. A version shops may be on can't be deleted.`)
if (problems.length) {
  console.error('check:themes — released theme files:')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`check:themes — clean (${files.length} versions)`)
