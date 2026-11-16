// `npm run check`: the guardrails, whoever wrote the code (a person, Claude Code, Studio later). Runs in CI.
//  1. No key in source: nothing like frs_pub_… or frs_test_… in any file (keys come only from the environment).
//  2. The legal block on every page: the root layout renders shop.legal (legal name, address, customer care, grievance
//     officer) and the policy links, from the API at runtime.
//  3. No arithmetic on a price: prices, M.R.P. and prior prices are shown as the API gives them (lib/money.ts formats).
//  4. No HTML from the API: nothing is rendered with dangerouslySetInnerHTML.
//  5. The paths stay /products/<handle> and /collections/<handle>; the bag goes to checkout only through cartLink.
//  6. The brand is the store's (Console › Brand), never this site's: no logo, brand or monogram file in the site; the
//     header draws <Logo> (app/layout.tsx, no inline <svg>); every colour and font from <BrandStyle>'s variables (no hex
//     colour, rgb(), hsl() or font family outside components/frrata/).
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
// 6. The brand record (one-address P1·7).
const BRAND_FILE = /(^|[\/])(logo|brand|monogram)[^\/]*\.(svg|png|webp|jpe?g|gif|avif|ico)$/i
for (const f of walk('.')) if (BRAND_FILE.test(f)) problems.push(`${f}: a logo file in the site. The store's logo is in Console › Brand; draw it with <Logo>.`)
if (!/<Logo\b/.test(layout)) problems.push('app/layout.tsx: the header must draw the store\'s logo with <Logo> (components/frrata/logo.tsx).')
if (/<svg\b/i.test(layout)) problems.push('app/layout.tsx: an inline <svg> in the header. The logo comes from the store: use <Logo>.')
if (!/<BrandStyle\b/.test(layout)) problems.push('app/layout.tsx: render <BrandStyle brand={shop.brand} /> once, so colours and fonts come from the store.')
const OWN = /(^|[\/])components[\/]frrata[\/]/
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
for (const f of code.filter((x) => /\.(css|tsx?)$/.test(x) && !OWN.test(x) && !x.endsWith('lib/cart-link.ts'))) {
  const src = stripComments(readFileSync(f, 'utf8'))
  src.split('\n').forEach((l, i) => {
    const at = `${f}:${i + 1}`
    if (f.endsWith('.css')) {
      if (/#[0-9a-fA-F]{3,8}\b/.test(l) || /\b(rgba?|hsla?|oklch|hwb|lab|lch)\(/.test(l)) problems.push(`${at}: a colour of the site's own. Use the store's: var(--brand-…) from <BrandStyle>.`)
      const fam = /font-family\s*:\s*([^;}]+)/.exec(l)?.[1] ?? /(?<![-\w])font\s*:\s*([^;}]+)/.exec(l)?.[1]
      if (fam && !/var\(--brand-(headings|body)\)|^\s*inherit\b/.test(fam)) problems.push(`${at}: a font of the site's own. Use var(--brand-headings) or var(--brand-body).`)
    } else {
      if (/['"`]#[0-9a-fA-F]{3,8}['"`]/.test(l) || /['"`](rgba?|hsla?)\(/.test(l)) problems.push(`${at}: a colour in code. Use the store's: var(--brand-…) from <BrandStyle>.`)
      if (/fontFamily\s*:\s*['"`](?!var\(--brand-)/.test(l)) problems.push(`${at}: a font in code. Use var(--brand-headings) or var(--brand-body).`)
    }
  })
}
for (const dir of ['app/products/[handle]', 'app/collections/[handle]']) if (!existsSync(join(dir, 'page.tsx'))) problems.push(`${dir}/page.tsx: keep this path. The store's own pages send shoppers here by it.`)
if (problems.length) { console.error(problems.join('\n')); console.error(`check: ${problems.length} problem(s)`); process.exit(1) }
console.log('check: clean (no key in source, the legal block, no price arithmetic, no HTML, the paths, the bag link, the brand from the store)')
