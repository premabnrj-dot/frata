// Fails: a merchant cost in what a shop page SERVES (HTML and the RSC payload), not just in its script files.
//
// check:payload — run against a running app (BASE_URL) with a seeded shop whose
// variants carry unit_cost = 4242421 (frata-verify). check:client-bundle reads
// only .next/static; props a server component passes to a client island travel
// in the HTML and the ?_rsc payload, so this reads those too (tenancy review
// 2026-11-07). Usage: SHOP_HOST=kesar-studio.frata.test BASE_URL=http://localhost:3077 PATHS="/ /products/x" node scripts/check-payload.mjs
import { SENTINELS } from './cost-sentinels.mjs'

const base = process.env.BASE_URL ?? 'http://localhost:3077'
const host = process.env.SHOP_HOST
const paths = (process.env.PATHS ?? '/ /products /sitemap.xml').split(/\s+/).filter(Boolean)
if (!host) { console.error('check:payload — set SHOP_HOST to a seeded shop host'); process.exit(1) }
// The seeded cost in paise, and as rupees the way a page would print it.
const NEEDLES = ['4242421', '42424.21', '42,424.21', ...SENTINELS]
const failures = []
for (const p of paths) {
  for (const [kind, headers] of [['html', {}], ['rsc', { RSC: '1' }]]) {
    const r = await fetch(base + p, { headers: { host, ...headers }, redirect: 'manual' })
    const text = await r.text()
    const hits = NEEDLES.filter((n) => text.includes(n))
    if (hits.length) failures.push(`${p} (${kind}, ${r.status})  carries ${hits.join(', ')}`)
  }
}
if (failures.length) {
  console.error('check:payload — a merchant cost reaches the shopper:')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(`check:payload — clean (${paths.length} pages, HTML and RSC)`)
