#!/usr/bin/env node
// =============================================================================
// FILE: scripts/affected-flows.mjs — which e2e flows a change touches (release-agent, e2e-runner). For each changed file
// under src/app/(console|admin)/<area>/… it finds the flows that open "/<surface>/<area>"; a change in shared code
// (src/components, src/domains, src/lib, globals.css, base.css) names the flows whose own source mentions the changed
// module's name, plus `ux` for shared UI. Prints the npm command. Usage: node scripts/affected-flows.mjs [base=origin/main]
// =============================================================================
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

const base = process.argv[2] ?? 'origin/main'
const changed = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' }).split('\n').filter(Boolean)
const flows = readdirSync('e2e/flows').filter((f) => f.endsWith('.mjs')).map((f) => {
  const src = readFileSync(`e2e/flows/${f}`, 'utf8')
  return { file: f, name: src.match(/name:\s*'([a-z0-9-]+)'/)?.[1], src }
}).filter((f) => f.name)
const picked = new Map()
const add = (f, why) => { if (!picked.has(f.name)) picked.set(f.name, why) }
for (const path of changed) {
  const route = path.match(/^src\/app\/\((console|admin)\)\/(console|admin)\/([^/]+)/)
  if (route) { for (const f of flows) if (f.src.includes(`/${route[2]}/${route[3]}`)) add(f, path); continue }
  if (path.startsWith('e2e/flows/')) { const f = flows.find((x) => x.file === basename(path)); if (f) add(f, path); continue }
  if (/^src\/(components|domains|lib)\//.test(path) || /src\/app\/(globals|base|shop)\.css$/.test(path)) {
    const mod = basename(path).replace(/\.(tsx?|css)$/, '')
    for (const f of flows) if (mod.length > 3 && f.src.includes(mod)) add(f, path)
    if (/^src\/components\/|\.css$/.test(path)) { const ux = flows.find((f) => f.name === 'ux'); if (ux) add(ux, path) }
  }
}
if (!picked.size) { console.log('No e2e flow is touched by this change.'); process.exit(0) }
for (const [name, why] of picked) console.log(`${name.padEnd(20)} ← ${why}`)
console.log(`\nnpm run e2e -- --only ${[...picked.keys()].join(',')}`)
