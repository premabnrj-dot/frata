// `npm run check`: the guardrails, whoever wrote the code (a person, Claude Code, Studio later). Runs in CI.
//  1. No key in source: nothing like frs_pub_… or frs_test_… in any file (keys come only from the environment).
//  2. The legal block on every page: the root layout renders shop.legal (legal name, address, customer care, grievance
//     officer) and the policy links, from the API at runtime.
//  3. No arithmetic on a price: prices, M.R.P. and prior prices are shown as the API gives them (lib/money.ts formats).
//  4. No HTML from the API: nothing is rendered with dangerouslySetInnerHTML.
//  5. The paths stay /products/<handle> and /collections/<handle>; the bag goes to checkout only through cartLink.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// .env*.local holds the developer's own key and git ignores it: never scanned (the check keeps keys out of git).
const SKIP = new Set(['node_modules', '.next', '.git'])
const walk = (d) => readdirSync(d).flatMap((n) => { if (SKIP.has(n) || /^\.env(\..+)?\.local$/.test(n)) return []; const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const code = walk('.').filter((f) => /\.(tsx?|mjs|js|json|md|css|env\.example)$/.test(f) || f.endsWith('.env.example'))
const problems = []
const KEY = /frs_(pub|test)_[0-9A-Za-z]{6,}/
for (const f of walk('.').filter((x) => !x.endsWith('.png'))) if (KEY.test(readFileSync(f, 'latin1'))) problems.push(`${f}: a Frrata key in source. Put it in .env.local (FRRATA_KEY), never in a file.`)
// Comments don't count: the fields must be rendered (JSX), not mentioned.
const layout = (existsSync('app/layout.tsx') ? readFileSync('app/layout.tsx', 'utf8') : '').replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|^\s*\/\/.*$/gm, '')
for (const part of ['legal.legalName', 'legal.address', 'legal.customerCare', 'legal.grievanceOfficer', 'policies'])
  if (!layout.includes(part)) problems.push(`app/layout.tsx: the legal block must show ${part} on every page (India's E-Commerce Rules).`)
const PRICE = /(\b(price|mrp|priorPrice)|\.(min|max))\s*[-+*/%]=?\s*[\w(.]|[\w)]\s*[-+*/%]\s*[\w.]*\.(price|mrp|priorPrice|min|max)\b|Math\.\w+\([^)]*\.(price|mrp|priorPrice|min|max)\b/
for (const f of code.filter((x) => /\.tsx?$/.test(x) && !x.endsWith('lib/money.ts') && !x.endsWith('lib/cart-link.ts'))) {
  const src = readFileSync(f, 'utf8')
  src.split('\n').forEach((l, i) => { if (!/^\s*\/\//.test(l) && PRICE.test(l)) problems.push(`${f}:${i + 1}: arithmetic on a price. Show it as the API gives it (rupees()).`) })
  if (/dangerouslySetInnerHTML/.test(src)) problems.push(`${f}: dangerouslySetInnerHTML. API text is text, never HTML.`)
  if (/\/cart\?l=/.test(src)) problems.push(`${f}: a hand-made bag link. Use cartLink() (lib/cart-link.ts).`)
}
for (const dir of ['app/products/[handle]', 'app/collections/[handle]']) if (!existsSync(join(dir, 'page.tsx'))) problems.push(`${dir}/page.tsx: keep this path. The store's own pages send shoppers here by it.`)
if (problems.length) { console.error(problems.join('\n')); console.error(`check: ${problems.length} problem(s)`); process.exit(1) }
console.log('check: clean (no key in source, the legal block, no price arithmetic, no HTML, the paths, the bag link)')
