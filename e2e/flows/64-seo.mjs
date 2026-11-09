// =============================================================================
// FLOW: search and sharing (S·0, the regression net written before any SEO change — plan
// docs/plans/2026-11-09-seo-and-sharing.md). Each page type is fetched as each crawler fetches it — a plain GET with
// that user agent, no JavaScript — and the raw <head> is read the way the crawler reads it. Asserts what the shop
// serves today; each later task (S·1, S·2) extends it.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { PORTS, SHOP_DOMAIN } from '../lib.mjs'

const HOST = `kesar-studio.${SHOP_DOMAIN}`
const CRAWLERS = {
  whatsapp: 'WhatsApp/2.23.20.0 A',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  x: 'Twitterbot/1.0',
  pinterest: 'Pinterestbot/1.0 (+http://www.pinterest.com/bot.html)',
  telegram: 'TelegramBot (like TwitterBot)',
  linkedin: 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  google: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
}

/** One GET as a crawler would make it (node:http: undici drops a Host header — frata-gotchas). */
function get(path, ua, host = HOST) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: PORTS.app, path, method: 'GET', headers: { host, 'user-agent': ua, accept: 'text/html,*/*' } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    r.on('error', reject); r.setTimeout(15_000, () => r.destroy(new Error(`timeout ${path}`))); r.end()
  })
}

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
/** The raw <head> as sent: crawlers read no JavaScript and no streamed tags after it. */
function head(html) {
  const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  assert.ok(m, 'a <head> in the first HTML')
  const h = m[1]
  const attr = (tag, a) => { const x = tag.match(new RegExp(`\\s${a}="([^"]*)"`, 'i')); return x ? unescape(x[1]) : null }
  const metas = [...h.matchAll(/<meta\b[^>]*>/gi)].map((x) => x[0])
  const prop = (p) => metas.filter((t) => attr(t, 'property') === p || attr(t, 'name') === p).map((t) => attr(t, 'content'))
  const link = (rel) => [...h.matchAll(/<link\b[^>]*>/gi)].map((x) => x[0]).filter((t) => attr(t, 'rel') === rel).map((t) => attr(t, 'href'))
  const title = h.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
  return { raw: h, prop, one: (p) => prop(p)[0] ?? null, link, title: title ? unescape(title) : null }
}
const jsonLd = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
const ldOfType = (blocks, type) => blocks.flatMap((b) => [b, ...(b['@graph'] ?? [])]).filter((b) => [].concat(b['@type']).includes(type))

export default {
  name: 'seo',
  async run(t) {
    const { db } = t
    const [product] = await db`select p.id, p.handle, p.title from products p join tenants tn on tn.id = p.tenant_id
      where tn.slug = 'kesar-studio' and p.handle = 'chanderi-kurta-set'`
    const prices = (await db`select price from variants where product_id = ${product.id}`).map((v) => Number(v.price))

    await t.step('every crawler gets the product page with its tags in the first HTML', async () => {
      for (const [name, ua] of Object.entries(CRAWLERS)) {
        const r = await get(`/products/${product.handle}`, ua)
        assert.equal(r.status, 200, `${name}: status`)
        const h = head(r.body)
        assert.equal(h.link('canonical')[0], `https://${HOST}/products/${product.handle}`, `${name}: canonical`)
        assert.ok(h.title?.includes(product.title), `${name}: title`)
        assert.equal(h.one('og:url'), `https://${HOST}/products/${product.handle}`, `${name}: og:url`)
        assert.ok(h.one('og:title'), `${name}: og:title`)
        assert.ok(h.one('og:description'), `${name}: og:description`)
        assert.match(h.one('og:image') ?? '', /^https:\/\//, `${name}: og:image absolute https`)
        assert.ok(r.body.length < 1_000_000, `${name}: page under 1 MB (Apple, Meta)`)
        assert.ok(Buffer.byteLength(r.body.slice(0, r.body.indexOf('</head>'))) < 300_000, `${name}: <head> in the first 300 KB (WhatsApp)`)
      }
      // S1·1: one builder — a product card with its price (Meta, Pinterest), a large X card, the locale, large previews.
      const h = head((await get(`/products/${product.handle}`, CRAWLERS.facebook)).body)
      assert.equal(h.one('og:type'), 'product', 'og:type product')
      assert.ok(prices.includes(Math.round(Number(h.one('product:price:amount')) * 100)), `product:price:amount ${h.one('product:price:amount')} is a variant's price`)
      assert.equal(h.one('product:price:currency'), 'INR')
      assert.match(h.one('product:availability') ?? '', /^(in stock|out of stock|preorder)$/)
      assert.equal(h.one('og:locale'), 'en_IN')
      assert.equal(h.one('twitter:card'), 'summary_large_image')
      assert.ok(h.one('og:image:alt'), 'og:image:alt')
      assert.ok((h.one('og:description') ?? '').length <= 80, 'og:description within WhatsApp\'s 80')
      assert.doesNotMatch(h.one('og:title') ?? '', /Kesar Studio/, 'og:title without the shop name')
      assert.match(h.one('robots') ?? '', /max-image-preview:large/)
      return Object.keys(CRAWLERS).join(', ')
    })

    await t.step('a shared link with utm tags previews as the clean page: the same canonical and og:url', async () => {
      const clean = head((await get(`/products/${product.handle}`, CRAWLERS.whatsapp)).body)
      const tagged = head((await get(`/products/${product.handle}?utm_source=whatsapp&utm_medium=social`, CRAWLERS.whatsapp)).body)
      assert.equal(tagged.link('canonical')[0], clean.link('canonical')[0])
      assert.equal(tagged.one('og:url'), clean.one('og:url'))
      assert.equal(tagged.one('og:image'), clean.one('og:image'))
    })

    await t.step('the product markup parses and states a price the product has', async () => {
      const r = await get(`/products/${product.handle}`, CRAWLERS.google)
      const blocks = jsonLd(r.body)
      assert.ok(blocks.length > 0, 'JSON-LD present')
      const items = [...ldOfType(blocks, 'Product'), ...ldOfType(blocks, 'ProductGroup').flatMap((g) => g.hasVariant ?? [])]
      assert.ok(items.length > 0, 'a Product or ProductGroup')
      const offered = items.flatMap((i) => [].concat(i.offers ?? [])).map((o) => Math.round(Number(o.price) * 100))
      assert.ok(offered.length > 0, 'offers')
      for (const p of offered) assert.ok(prices.includes(p), `offer price ${p} is a variant's price (${prices.join(', ')})`)
      for (const o of items.flatMap((i) => [].concat(i.offers ?? []))) assert.equal(o.priceCurrency, 'INR')
      // A merchant's costs never reach a page (ADR-0003): no cost word in the head or the markup.
      assert.doesNotMatch(head(r.body).raw + JSON.stringify(blocks), /\b(cogs|cost_price|costPrice|unit_cost|freight|margin)\b/i)
    })

    await t.step('home, a collection, the product list and a policy answer every crawler with a canonical', async () => {
      const [c] = await db`select handle from collections c join tenants tn on tn.id = c.tenant_id where tn.slug = 'kesar-studio' order by handle limit 1`
      for (const path of ['/', `/collections/${c.handle}`, '/products', '/policies/returns']) {
        for (const [name, ua] of Object.entries(CRAWLERS)) {
          const r = await get(path, ua)
          assert.equal(r.status, 200, `${path} ${name}`)
          const canonical = head(r.body).link('canonical')[0]
          assert.equal(canonical, `https://${HOST}${path === '/' ? '/' : path}`, `${path} ${name}: canonical`)
        }
      }
      const home = head((await get('/', CRAWLERS.facebook)).body)
      assert.ok(home.one('og:title') && home.one('og:url'), 'home: og:title and og:url')
      assert.ok(ldOfType(jsonLd((await get('/', CRAWLERS.google)).body), 'OnlineStore').length === 1, 'home: OnlineStore markup')
    })

    await t.step('a draft product is not found, and the bag is never indexed', async () => {
      const draft = await get('/products/secret-draft', CRAWLERS.google)
      assert.equal(draft.status, 404)
      const bag = head((await get('/bag', CRAWLERS.google)).body)
      assert.match(bag.one('robots') ?? '', /noindex/)
    })

    await t.step('robots.txt allows crawling and names the sitemap; the sitemap lists the product', async () => {
      const robots = await get('/robots.txt', CRAWLERS.google)
      assert.equal(robots.status, 200)
      assert.match(robots.body, /Allow: \//)
      assert.match(robots.body, new RegExp(`Sitemap: https://${HOST.replace(/\./g, '\\.')}/sitemap\\.xml`))
      const sitemap = await get('/sitemap.xml', CRAWLERS.google)
      assert.equal(sitemap.status, 200)
      assert.ok(sitemap.body.includes(`https://${HOST}/products/${product.handle}`), 'product in the sitemap')
      assert.ok(!sitemap.body.includes('/products/secret-draft'), 'no draft in the sitemap')
    })
  },
}
