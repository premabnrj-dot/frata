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
const SKIP = new Set(['node_modules', '.next', '.git', '.vercel', 'out'])
const walk = (d) => readdirSync(d).flatMap((n) => { if (SKIP.has(n) || /^\.env(\..+)?\.local$/.test(n)) return []; const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const code = walk('.').filter((f) => /\.(tsx?|jsx?|mjs|json|md|css|env\.example)$/.test(f) || f.endsWith('.env.example'))
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
// 6. The brand record (one-address P1·7). The two files the kit ships (components/frrata/) set the variables and draw the
// logo; every other file uses them.
// A logo folder, a name with logo, monogram, wordmark or lockup as a word part (house-of-ayuda-wordmark.svg), or an SVG in
// a brand folder (brand/house-stacked.svg). A photo named for the brand's story (brand-story-hero.jpg) is not one.
const BRAND_FILE = /(^|[\\/])(logos?[\\/][^\\/]+|([^\\/]*[^a-z\\/])?(logo|monogram|wordmark|lockup|brand[-_]?(logo|mark))[^\\/]*)\.(svg|png|webp|jpe?g|gif|avif|ico)$|(^|[\\/])brand[\\/][^\\/]+\.svg$/i
for (const f of walk('.')) if (BRAND_FILE.test(f)) problems.push(`${f}: a logo file in the site. The store's logo is in Console › Brand. Draw it with <Logo>.`)
// The layout's own <header> draws <Logo>; a site whose header is a component passes it <Logo> from the layout.
const header = /<header\b[\s\S]*?<\/header>/.exec(layout)?.[0] ?? ''
if (!/<Logo\b/.test(header || layout)) problems.push('app/layout.tsx: the header must draw the store\'s logo with <Logo> (components/frrata/logo.tsx).')
if (/<svg\b/i.test(header.replace(/<nav\b[\s\S]*?<\/nav>/g, ''))) problems.push('app/layout.tsx: an inline <svg> beside the header\'s logo. The logo comes from the store: use <Logo>.')
if (!/<BrandStyle\b/.test(layout)) problems.push('app/layout.tsx: render <BrandStyle brand={shop.brand} /> once, so colours and fonts come from the store.')
const KIT_OWN = new Set(['components/frrata/logo.tsx', 'components/frrata/brand-style.tsx'])
const rel = (f) => f.replace(/\\/g, '/').replace(/^\.\//, '')
// Comments are blanked with their line breaks kept, so a problem's line number stays right.
const blank = (m) => m.replace(/[^\n]/g, '')
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^\s*\/\/.*$/gm, blank)
const COLOUR_FN = /\b(rgba?|hsla?|oklch|oklab|hwb|lab|lch)\(/
const GENERIC = /^(inherit|initial|unset|revert|serif|sans-serif|monospace|ui-monospace|ui-sans-serif|ui-serif|system-ui|cursive|emoji|math)$/
const fontOk = (v) => /var\(--brand-(headings|body)\)/.test(v) || v.split(',').every((x) => GENERIC.test(x.trim().replace(/['"]/g, '')))
for (const f of code.filter((x) => /\.(css|jsx?|tsx?)$/.test(x) && !KIT_OWN.has(rel(x)) && !x.endsWith('lib/cart-link.ts'))) {
  const src = stripComments(readFileSync(f, 'utf8'))
  src.split('\n').forEach((l, i) => {
    const at = `${f}:${i + 1}`
    if (f.endsWith('.css')) {
      // Values only (after a colon), url(#…) references left out: an id selector or a mask isn't a colour.
      for (const decl of l.matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)) {
        const [, prop, raw] = decl, v = raw.replace(/url\([^)]*\)/g, '')
        if (/#[0-9a-fA-F]{3,8}\b/.test(v) || COLOUR_FN.test(v)) problems.push(`${at}: a colour set in the site. Use a var(--brand-…) from <BrandStyle>. For a shadow, use color-mix(in srgb, var(--brand-text) 12%, transparent).`)
        if (prop === 'font-family' && !fontOk(v)) problems.push(`${at}: a font of the site's own. Use var(--brand-headings) or var(--brand-body).`)
        if (prop === 'font' && !/^\s*(inherit|initial|unset|revert)\s*$/.test(v) && !/var\(--brand-(headings|body)\)/.test(v)) problems.push(`${at}: a font of the site's own. Use var(--brand-headings) or var(--brand-body).`)
      }
    } else {
      if (/\b(color|colou?r|fill|stroke|background(Color)?|border(Color)?|outlineColor|stopColor)\s*[:=]\s*\{?\s*['"`]\s*(#[0-9a-fA-F]{3,8}|(rgba?|hsla?)\()/.test(l)) problems.push(`${at}: a colour in code. Use the store's: var(--brand-…) from <BrandStyle>.`)
      if (/fontFamily\s*[:=]\s*\{?\s*['"`](?!var\(--brand-)/.test(l)) problems.push(`${at}: a font in code. Use var(--brand-headings) or var(--brand-body).`)
    }
  })
}
for (const dir of ['app/products/[handle]', 'app/collections/[handle]']) if (!existsSync(join(dir, 'page.tsx'))) problems.push(`${dir}/page.tsx: keep this path. The store's own pages send shoppers here by it.`)
if (problems.length) { console.error(problems.join('\n')); console.error(`check: ${problems.length} problem(s)`); process.exit(1) }
console.log('check: clean (no key in source, the legal block, no price arithmetic, no HTML, the paths, the bag link, the brand from the store)')
