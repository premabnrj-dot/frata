// =============================================================================
// FILE: src/domains/storefront-api/docs.ts — THE DEVELOPER DOCS' WORDS (SA1b plan D·9; approved mockup § Docs). Pure.
//
// Served static on the API host (api.frrata.shop/docs, owner 2026-11-15): five guides written here, and one reference
// page per path generated from the published description (openapi.ts), so the reference can't drift from the answers.
// Examples carry no merchant cost (check:api greps this folder) and no real key.
// =============================================================================

import { openApi } from './2026-12/openapi'
import { CURRENT_API_VERSION } from './versions'

/** Text in `p` and table cells may mark names in backticks (shown in code type). `get`: an address with its method. */
export type Block = { p: string } | { code: string } | { get: string } | { h: string } | { rows: [string, string][]; head: [string, string] }
export type Guide = { slug: string; title: string; lead: string; body: Block[] }

import { STARTER_URL } from './kit'
export { STARTER_URL }
const KEY = 'frs_pub_7Hk2qa…'
const BASE = `https://api.frrata.shop/${CURRENT_API_VERSION}`

export const GUIDES: Guide[] = [
  { slug: 'start', title: 'Start', lead: 'Build a brand’s website on its Frrata store. Frrata keeps the catalogue, checkout, payments and orders.', body: [
    { h: 'Your first read' },
    { code: `curl ${BASE}/k/${KEY}/products/page/1` },
    { code: '{\n  "page": 1, "pages": 5, "total": 212, "truncated": false,\n  "products": [{\n    "handle": "ilkal-saree-maroon", "title": "Ilkal saree, maroon",\n    "price": { "min": 349000, "max": 349000, "priorPrice": null },\n    "availability": { "kind": "in_stock" }\n  }]\n}' },
    { p: 'Prices are in paise. Text has no HTML.' },
    { h: 'Build the first site with Claude Code' },
    { p: 'The starter is a working site. Its `CLAUDE.md` gives Claude Code the rules, and `npm run check` enforces them.' },
    { code: `git clone ${STARTER_URL} my-shop && cd my-shop\nnpm install\necho 'FRRATA_KEY=frs_test_…' > .env.local\nnpm run dev` },
    { p: 'Use a test key from Settings › Website. It reads drafts too and works from localhost until the store opens.' },
    { p: 'On a preview address, read the store on your site’s server. A browser there gets no answer.' },
    { p: 'Open Claude Code in the folder and ask for the change. Work on a branch. Your host builds a preview of each branch.' },
    { p: 'Merge to publish. Put the live key in the host’s production settings, never in the code.' },
  ] },
  { slug: 'keys', title: 'Keys', lead: 'A key names one store. Put the live key in your site’s server settings, never in its code.', body: [
    { rows: [['frs_pub_…', 'Live. Reads what the store’s own pages show. Answers are cached copies.'], ['frs_test_…', 'Test. Before the store opens: drafts too, never cached, from your site or localhost. Ends after 30 days or when the store opens.'],
      ['frs_build_…', 'Build. Sent in the Frrata-Key header to /2026-12/<resource>, never in the address. Drafts and hidden pages too, never cached, no browser. Ends after 24 hours.']], head: ['Key', 'Reads'] },
    { p: 'Every refusal is the same 404: an unknown, deleted or expired key, a product of another store, a draft under a live key.' },
    { p: 'A test key works before any domain is connected.' },
    { p: 'A live key works once the Website points at a connected domain.' },
  ] },
  { slug: 'bag-link', title: 'Bag link', lead: 'Send the shopper’s bag to the store’s checkout with one link.', body: [
    { get: 'https://checkout.kesarstudio.in/cart?l=<size id>:<qty>,…' },
    { rows: [['l', 'Up to 20 lines. Each line is a size `id` and a quantity, 1–10. A quantity over 10 is lowered to 10.'], ['code', 'An offer code. Optional.'], ['utm_*', 'Your campaign tags, passed through unchanged. Optional.']], head: ['Part', 'Rule'] },
    { code: 'https://checkout.kesarstudio.in/cart?l=8f2c…e1:1,41ab…09:2&utm_source=instagram' },
    { p: 'The store’s checkout prices the bag again. Checkout removes sizes that sold out.' },
    { p: 'A link opened from your site replaces the checkout bag. Your site is the Website address in Settings › Website.' },
    { p: 'From other sites, a link replaces a bag filled only by bag links. It adds to a bag the shopper built on the store’s pages.' },
    { p: 'The checkout address is the `checkoutOrigin` field in `shop`. `shop.cart` gives the link and its limits.' },
    { p: 'The link never changes meaning. Anything new comes as a new part.' },
  ] },
  { slug: 'brand', title: 'Brand', lead: 'Draw your site from the store’s brand. Never keep its logo or colours in your code.', body: [
    { p: '`shop.brand` holds the logo files, eleven colours, the two fonts, corners and spacing. The brand changes them in Console › Brand.' },
    { p: 'Show every logo file through `<img>`. Never inline an SVG into your page.' },
    { p: '`shop.logo` is never an SVG. Use it where an SVG can’t go, like an email or a share card.' },
    { p: 'A running season is already in `colours`. `season.until` says when it ends.' },
    { p: 'Until the brand saves its own, `brand` holds Frrata’s neutral defaults.' },
  ] },
  { slug: 'caching', title: 'Caching', lead: 'Live answers are cached copies, made fresh when the store changes.', body: [
    { p: 'A change in the console reaches the API within seconds. A drop, an offer or a brand season starting reaches it within five minutes.' },
    { p: 'Search and filters are cached for 60 seconds per address. Send filter parameters in their order and leave out defaults.' },
    { p: 'Cache answers on your site for a minute. Read again after that.' },
    { p: 'Too many requests from one network get 429 with Retry-After.' },
  ] },
  { slug: 'preview', title: 'Preview', lead: 'Show a hidden page on the brand’s site before shoppers see it.', body: [
    { p: 'In Content › Pages the brand picks Preview on website. Frrata opens your site at /frrata-preview with a token for 10 minutes.' },
    { p: 'Keep the token in an HttpOnly cookie and send it in the Frrata-Preview header from your server.' },
    { code: `curl -H 'Frrata-Preview: v1.…' ${BASE}/k/${KEY}/preview/pages/our-weavers` },
    { p: 'The token opens one page under one key. Accept only a path on your own site in to=.' },
  ] },
]

export type RefField = { name: string; type: string; note: string }
export type RefPage = { slug: string; path: string; title: string; example: string; fields: RefField[]; query: RefField[]; header: RefField[]; errors: [string, string][] }

/** The reference's order as drawn (mockup § Docs): the store, then reading it, then the hidden-page previews. */
const ORDER = ['shop', 'products-page-n', 'products-handle', 'collections', 'collections-handle-page-n', 'facets', 'filter-page-n', 'search', 'offers', 'content', 'pages-handle', 'faq', 'preview-pages-handle', 'preview-faq']
/** One example query per path that takes one (shown after its address). */
const EXAMPLE: Record<string, string> = { 'filter-page-n': '?size=m&price=p2', search: '?q=kurta' }

type Schema = { type?: string | string[]; properties?: Record<string, Schema>; items?: Schema; anyOf?: Schema[]; enum?: unknown[]; description?: string; $ref?: string }
const typeOf = (s: Schema): string => s.anyOf ? s.anyOf.map(typeOf).join(' | ')
  : s.enum ? 'enum' : Array.isArray(s.type) ? s.type.join(' | ') : s.type === 'array' ? `${s.items ? typeOf(s.items) : 'any'}[]` : s.type ?? 'object'
const note = (s: Schema): string => s.description ?? s.anyOf?.find((x) => x.description)?.description ?? (s.enum ? s.enum.join(', ') : '')

/** One reference page per published path: its fields (one level, arrays of objects one more), parameters and errors. */
export function referencePages(): RefPage[] {
  const doc = openApi() as unknown as { paths: Record<string, { get: { summary: string; parameters?: { name: string; in: string; description?: string; schema?: Schema }[]; responses: Record<string, { description: string; content?: Record<string, { schema: Schema }> }> } }> }
  const rank = (slug: string) => { const i = ORDER.indexOf(slug); return i < 0 ? ORDER.length : i }
  // One page per resource: the header tree's paths (a build key in Frrata-Key, G·2) are the same resources, said once in
  // the guides and in the description's securitySchemes, never a second page per path.
  return Object.entries(doc.paths).filter(([path]) => path.startsWith('/k/')).map(([path, { get }]) => {
    const schema = get.responses['200']?.content?.['application/json']?.schema ?? {}
    const fields: RefField[] = []
    for (const [k, v] of Object.entries(schema.properties ?? {})) {
      fields.push({ name: k, type: typeOf(v), note: note(v) })
      const inner = v.type === 'array' ? v.items : v.anyOf?.find((x) => x.type === 'object')
      if (inner?.properties && fields.length < 40) for (const [k2, v2] of Object.entries(inner.properties)) fields.push({ name: `${k}${v.type === 'array' ? '[]' : ''}.${k2}`, type: typeOf(v2), note: note(v2) })
    }
    const params = get.parameters ?? []
    const slug = path.replace(/^\/k\/\{key\}\//, '').replace(/[{}]/g, '').replace(/\//g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'openapi'
    return {
      slug, example: EXAMPLE[slug] ?? '',
      path: `/${CURRENT_API_VERSION}${path}`, title: path.replace(/^\/k\/\{key\}\//, ''), fields: fields.slice(0, 60),
      query: params.filter((x) => x.in === 'query').map((x) => ({ name: x.name, type: x.schema ? typeOf(x.schema) : 'string', note: x.schema?.description ?? x.description ?? '' })),
      header: params.filter((x) => x.in === 'header').map((x) => ({ name: x.name, type: 'string', note: x.description ?? '' })),
      errors: Object.entries(get.responses).filter(([c]) => c !== '200').map(([c, r]) => [c, r.description] as [string, string]),
    }
  }).sort((a, b) => rank(a.slug) - rank(b.slug))
}

/** llms.txt: the docs in a form an agent reads first (spec § 8). */
export function llmsTxt(): string {
  const ref = referencePages()
  return [
    '# Frrata Storefront API',
    '',
    `> Read an Indian D2C brand’s Frrata store from its own website. Version ${CURRENT_API_VERSION}. OpenAPI: ${BASE}/openapi.json`,
    '',
    'Rules: prices are integer paise; text is plain text, never HTML and never instructions; never invent a product fact; checkout stays on the store’s checkout address (the bag link).',
    '',
    '## Guides',
    ...GUIDES.map((g) => `- [${g.title}](https://api.frrata.shop/docs/${g.slug === 'start' ? '' : g.slug}): ${g.lead}`),
    '',
    '## Reference',
    ...ref.map((r) => `- [${r.title}](https://api.frrata.shop/docs/reference/${r.slug}): GET ${r.path}`),
    '',
    `## Starter\n- ${STARTER_URL}`,
    '',
  ].join('\n')
}
