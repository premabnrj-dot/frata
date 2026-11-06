// Fails: a merchant cost in what a shop page SERVES (HTML and the RSC payload), not just in its script files.
//
// check:payload — run against a running app (BASE_URL) with a seeded shop whose
// variants carry unit_cost = 4242421 (frata-verify). check:client-bundle reads
// only .next/static; props a server component passes to a client island travel
// in the HTML and the ?_rsc payload, so this reads those too (tenancy review
// 2026-11-07). Usage: SHOP_HOST=kesar-studio.frata.test BASE_URL=http://localhost:3077 PATHS="/ /products/x" node scripts/check-payload.mjs
import { request } from 'node:http'
import { SENTINELS } from './cost-sentinels.mjs'

// fetch() drops a Host header silently (undici); node:http sends it, so the shop host is what is asked for.
const get = (url, headers) => new Promise((resolve, reject) => {
  const u = new URL(url)
  const req = request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers }, (res) => {
    let body = ''
    res.setEncoding('utf8'); res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: body }))
  })
  req.on('error', reject); req.end()
})

const base = process.env.BASE_URL ?? 'http://localhost:3077'
const host = process.env.SHOP_HOST
const paths = (process.env.PATHS ?? '/ /products /sitemap.xml').split(/\s+/).filter(Boolean)
if (!host) { console.error('check:payload — set SHOP_HOST to a seeded shop host'); process.exit(1) }
// The seeded cost in paise, and as rupees the way a page would print it.
const NEEDLES = ['4242421', '42424.21', '42,424.21', ...SENTINELS]
const failures = []
for (const p of paths) {
  for (const [kind, headers] of [['html', {}], ['rsc', { RSC: '1' }]]) {
    const r = await get(base + p, { host, ...headers })
    const text = r.text
    // Guard against asking the wrong surface: a shop page names the shop's own address.
    if (r.status !== 200) failures.push(`${p} (${kind})  answered ${r.status}, not 200 — list only pages that exist`)
    else if (!text.includes(host)) failures.push(`${p} (${kind})  did not come from ${host} — is the app built with this shop domain?`)
    const hits = NEEDLES.filter((n) => text.includes(n))
    if (hits.length) failures.push(`${p} (${kind}, ${r.status})  carries ${hits.join(', ')}`)
  }
}
// A shop page must be served from the page cache on a second visit (the spec's "static per path"; tenancy audit 2026-11-07).
for (const p of paths.filter((x) => !/\.(xml|txt)$/.test(x))) {
  const r = await get(base + p, { host })
  const hit = r.headers['x-nextjs-cache'], cc = String(r.headers['cache-control'] ?? '')
  if (r.status === 200 && (hit !== 'HIT' && hit !== 'STALE' || /private|no-store/.test(cc))) failures.push(`${p}  is rendered per request (x-nextjs-cache: ${hit ?? 'none'}, cache-control: ${cc})`)
}
if (failures.length) {
  console.error('check:payload — a merchant cost reaches the shopper, or a page is not cached:')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(`check:payload — clean (${paths.length} pages, HTML and RSC, served from cache)`)
