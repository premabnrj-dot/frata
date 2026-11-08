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

// The 250 KB category list (src/domains/catalogue/taxonomy.ts) is read on the
// server; a browser that needs a category asks for it. A category name only it
// holds marks a chunk that bundled it.
const TAXONOMY = 'Traditional & Ceremonial Clothing > Kurtas'

// The shop's words (src/components/storefront/words.ts, themes T2) are server-only: an island gets the strings it
// shows as a prop, so a shop never downloads both languages. A phrase only that module holds marks a chunk that
// bundled it (written as escapes so this file stays ASCII).
const WORDS = '\u0907\u0938 \u0936\u0949\u092a \u092a\u0930 \u0935\u093e\u092a\u0938\u0940 \u0928\u0939\u0940\u0902 \u0939\u094b\u0924\u0940'

let found = [], taxonomy = [], words = []
try {
  for (const f of files(ROOT)) {
    const text = readFileSync(f, 'utf8')
    const hits = SENTINELS.filter(s => text.includes(s))
    if (hits.length) found.push(`${f}  (${hits.join(', ')})`)
    if (text.includes(TAXONOMY)) taxonomy.push(f)
    if (text.includes(WORDS)) words.push(f)
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
if (taxonomy.length) {
  console.error('check:client-bundle — the category list is in the browser bundle:')
  for (const f of taxonomy) console.error('  ' + f)
  console.error('\n  A client file imports a value from catalogue/taxonomy.ts. Import only types there;')
  console.error('  ask the server (findCategories, categoryDetails) or use catalogue/category-id.ts.')
  process.exit(1)
}
if (words.length) {
  console.error('check:client-bundle — the shop words module is in the browser bundle:')
  for (const f of words) console.error('  ' + f)
  console.error('\n  A client file imports storefront/words.ts. Pass the island its strings as a prop (buyWords).')
  process.exit(1)
}
console.log('check:client-bundle — clean')
