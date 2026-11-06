// Fails the build: a merchant-cost field name in any browser chunk (ADR-0003).
//
// check:client-bundle — no cost reaches a browser. Runs after `next build`
// (npm's postbuild), locally and on Vercel. Import rules can be broken by a
// path nobody thought of; the build output cannot lie. Ekatan shipped its whole
// cost catalogue to customers for five days because one browser module read
// one row for a colour — this gate is why that cannot happen here silently.
//
// Reads only .next/static, so it cannot match its own documentation.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SENTINELS } from './cost-sentinels.mjs'

const ROOT = '.next/static'
// What a cost looks like: scripts/cost-sentinels.mjs.

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (p.endsWith('.js')) yield p
  }
}

let found = []
try {
  for (const f of files(ROOT)) {
    const text = readFileSync(f, 'utf8')
    const hits = SENTINELS.filter(s => text.includes(s))
    if (hits.length) found.push(`${f}  (${hits.join(', ')})`)
  }
} catch (e) {
  console.error(`check:client-bundle — no ${ROOT} to read; run it after next build.`)
  process.exit(1)
}

if (found.length) {
  console.error('check:client-bundle — cost data in the browser bundle:')
  for (const f of found) console.error('  ' + f)
  console.error('\n  A client component imports something that carries merchant costs.')
  console.error('  Compute on the server and pass the client a formatted value.')
  process.exit(1)
}
console.log('check:client-bundle — clean')
