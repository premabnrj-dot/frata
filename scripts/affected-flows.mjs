#!/usr/bin/env node
// =============================================================================
// FILE: scripts/affected-flows.mjs — which e2e flows a change touches (release-agent, e2e-runner). For each changed file
// under src/app/(console|admin)/<area>/… it finds the flows that open "/<surface>/<area>"; a change in shared code
// (src/components, src/domains, src/lib, globals.css, base.css) names the flows whose own source mentions the changed
// module's name or file name (a flow's header lists the files it covers), plus `ux` for shared UI. Prints the npm command. Usage: node scripts/affected-flows.mjs [base=origin/main]
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
const byName = (...names) => names.map((n) => flows.find((x) => x.name === n)).filter(Boolean)
for (const path of changed) {
  // Home, the console's own components and every workspace's layout (the shell): the UX sweep walks them all.
  if (/^src\/app\/\((console|admin|partner)\)\/(console|admin|partner)\/(\([a-z-]+\)\/)?(page\.tsx|layout\.tsx|_components\/)/.test(path)) { for (const f of byName('ux', 'neel-shell', 'partner-team')) add(f, path); continue }
  // Partner sign-in and passkeys (T1b): the workspace's routes, its sign-in, join and the email link.
  if (/^src\/app\/(\(partner\)\/|join\/|auth\/)|^src\/components\/passkeys\//.test(path)) for (const f of byName('partners', 'partner-team', 'staff-passkeys', 'email')) add(f, path)
  if (path.startsWith('src/components/shell/')) for (const f of byName('neel-shell')) add(f, path)
  const route = path.match(/^src\/app\/\((console|admin|partner)\)\/(console|admin|partner)\/([^/]+)/)
  if (route) { for (const f of flows) if (f.src.includes(`/${route[2]}/${route[3]}`)) add(f, path); continue }
  if (path.startsWith('e2e/flows/')) { const f = flows.find((x) => x.file === basename(path)); if (f) add(f, path); continue }
  if (/^src\/(components|domains|lib)\//.test(path) || /src\/app\/(globals|base|shop|neel)\.css$/.test(path)) {
    // By its name, or (a short one like bag.tsx) by its file name: a flow's header names the files it covers.
    const file = basename(path), mod = file.replace(/\.(tsx?|css)$/, '')
    for (const f of flows) if ((mod.length > 3 && f.src.includes(mod)) || f.src.includes(file)) add(f, path)
    // A primitive or a stylesheet: the UX sweep and the Neel gallery (its drawn values, keyboard and axe).
    if (/^src\/components\/|\.css$/.test(path)) for (const n of ['ux', 'neel']) { const f = flows.find((x) => x.name === n); if (f) add(f, path) }
  }
}
if (!picked.size) { console.log('No e2e flow is touched by this change.'); process.exit(0) }
for (const [name, why] of picked) console.log(`${name.padEnd(20)} ← ${why}`)
console.log(`\nnpm run e2e -- --only ${[...picked.keys()].join(',')}`)
