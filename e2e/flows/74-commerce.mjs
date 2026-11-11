// =============================================================================
// FLOW: Theme Studio TS1b — the worst page a Signal 1.5 owner can newly make, measured (docs/plans/2026-11-11-theme-
// studio-ts1.md § TS1b, the gate). The design form first: The drop from the library, its date and its pieces set in
// the form and saved. Then the Home every design can grow to: 2 commerce designs (The drop's 4 pieces, The edits' 4
// collections) and 2 others at their caps (Behind the bench, Size help: Devanagari words up to the page's limit),
// over seeded pieces with 5 colours and long titles, published. The second visit (served from the page cache) is
// read as bytes: HTML ≤ 300 kB, RSC ≤ 150 kB, ≤ 2 eager images on Home, Shop all and a collection. The page is
// checked to hold what it should before it is measured. Undo, then everything seeded is removed.
// =============================================================================
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import { CONSOLE, PORTS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const MP4 = readFileSync(new URL('../fixtures/loop.mp4', import.meta.url))
const VIDEO_INPUT = 'input[type=file][accept="video/mp4,video/quicktime"]'
const FRAME = 'iframe[title="Your shop with this look"]'
const HOST = 'kesar-studio.frata.test'
const PREFIX = 'e2e-commerce'
const BUDGET = { html: 300 * 1024, rsc: 150 * 1024, eager: 2 }
const COLOURS = ['Indigo', 'Rust', 'Haldi', 'Mehendi', 'Ivory']
const get = (path, headers = {}) => new Promise((res, rej) => http.get(`http://localhost:${PORTS.app}${path}`, { headers: { host: HOST, ...headers } }, (r) => {
  const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }))
}).on('error', rej))
/** The page as the cache serves it (a second visit): HIT or STALE, never a fresh render. */
const cached = async (path, headers = {}) => { let r; await until(async () => { r = await get(path, headers); return r.status === 200 && /HIT|STALE/.test(String(r.headers['x-nextjs-cache'])) }, 20_000); return r }
const eagerOf = (html) => (html.match(/<img\b[^>]*fetchpriority="high"/gi) ?? []).length
const deva = (n) => 'हाथ से बुना, प्राकृतिक रंगों में रंगा। '.repeat(Math.ceil(n / 36)).slice(0, n)
/** A real shop's photo: Blob's 16-character store host, all four widths (any phone photo makes them; speed review). */
const BLOB = 'https://k7f3q9x2m4p8w1z6.public.blob.vercel-storage.com'
/** The longest title a piece can have (140 characters), in two scripts. */
const title = (i) => `हाथ से बुना चंदेरी कुर्ता सेट — Handwoven Chanderi kurta set with dupatta, natural dyes, no. ${i} `.padEnd(140, '·')
/** The words a page's designs may hold (PAGE_LIMITS.textBytes), as fillText counts them. */
const TEXT_BYTES = 24_000
const fillBytes = (fill) => Object.values(fill).flatMap((f) => f.kind === 'heading' ? [f.text] : f.kind === 'text' ? f.body.flat().flatMap((r) => [r.text, r.link ?? ''])
  : f.kind === 'button' ? [f.label, f.link] : f.kind === 'accordion' ? f.items.flatMap((x) => [x.q, x.a]) : f.kind === 'product_grid' && f.source.kind === 'collection' ? [f.source.handle]
    : f.kind === 'date' ? [f.at ?? ''] : f.kind === 'image' ? [f.image?.alt ?? ''] : f.kind === 'video' ? [f.poster?.alt ?? ''] : []).reduce((n, x) => n + Buffer.byteLength(x), 0)

export default {
  name: 'commerce',
  async run(t) {
    const { db } = t
    const photo = (i) => ({ base: `${BLOB}/tenants/${KESAR}/products/00000000-0000-4000-8000-${String(900 + i).padStart(12, '0')}`, widths: [400, 800, 1200, 1600], width: 1600, height: 2000, alt: 'A kurta set, folded', decorative: false, focus: null })
    // Twelve pieces, 5 colours × 2 sizes, 140-character titles in two scripts, each colour's swatch cut from a photo;
    // six collections (two drops of different pieces, four edits).
    const ids = await db`insert into products ${db(Array.from({ length: 12 }, (_, i) => ({ tenant_id: KESAR, handle: `${PREFIX}-${i}`, title: title(i), status: 'active', published_at: new Date(Date.now() - i * 60_000), options: ['Size', 'Colour'], option_values: JSON.stringify([['S', 'M'], COLOURS]) })))} returning id, handle`
    await db`insert into variants ${db(ids.flatMap((p, i) => ['S', 'M'].flatMap((s) => COLOURS.map((c) => ({ tenant_id: KESAR, product_id: p.id, option_values: [s, c], price: 249000 + i * 1000, compare_at: i % 2 ? 299000 : null, stock: 3 })))))}`
    const imgs = await db`insert into product_images ${db(ids.flatMap((p, i) => [0, 1, 2].map((n) => ({ tenant_id: KESAR, product_id: p.id, ...(({ base, widths, width, height }) => ({ base, widths, width, height }))(photo(i * 3 + n)), alt: '', position: n }))))} returning id, product_id, position`
    await db`insert into product_colours ${db(ids.flatMap((p) => COLOURS.map((value, k) => ({ tenant_id: KESAR, product_id: p.id, value, crop_image_id: imgs.find((m) => m.product_id === p.id && m.position === 2).id, crop: JSON.stringify({ x: 20 + k * 12, y: 50, r: 10 }) }))))}`
    const cols = await db`insert into collections ${db([{ handle: PREFIX, title: 'The monsoon drop' }, { handle: `${PREFIX}-b`, title: 'The winter drop' }, ...[0, 1, 2, 3].map((i) => ({ handle: `${PREFIX}-edit-${i}`, title: `मानसून एडिट ${i} — Monsoon edit` }))].map((c) => ({ tenant_id: KESAR, ...c, kind: 'manual', sort: 'manual' })))} returning id, handle`
    await db`insert into collection_products ${db(cols.flatMap((c, k) => ids.filter((_, i) => k === 0 ? i < 6 : k === 1 ? i >= 6 : i % 4 === k - 2).map((p, n) => ({ tenant_id: KESAR, collection_id: c.id, product_id: p.id, position: n }))))}`
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    const draft = async () => (await db`select id, settings from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' and id not in (select revision_id from shop_theme_publishes) order by updated_at desc limit 1`)[0]
    try {
      await t.step('The design form: The drop from the library; its date and its pieces are set and saved', async () => {
        // A release decision is final (the trigger): an earlier flow's Signal rows go first, as 65-signal does.
        await db.begin(async (x) => { await x`set local session_replication_role = replica`; await x`delete from theme_versions where theme_key = 'signal'` })
        await db`insert into theme_versions (theme_key, version, released_at) values ('signal', '1.0.0', now()), ('signal', '1.1.0', now()), ('signal', '1.2.0', now()), ('signal', '1.3.0', now()), ('signal', '1.4.0', now()), ('signal', '1.5.0', now()) on conflict (theme_key, version) do update set released_at = now(), recalled_at = null, withdrawn_at = null`
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'Signal', exact: true }).click()
        await p.getByRole('dialog', { name: 'Signal' }).getByRole('button', { name: 'Try Signal in a draft' }).click()
        const ask = p.getByRole('dialog', { name: 'Try Signal?' })
        await Promise.race([ask.waitFor().then(() => ask.getByRole('button', { name: 'Try Signal' }).click()), p.waitForURL(/\/console\/look\/customize$/)])
        await p.waitForURL(/\/console\/look\/customize$/)
        const [rev] = await db`select theme_version from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`
        assert.equal(rev.theme_version, '1.5.0')
        await p.getByRole('tab', { name: 'Sections' }).click()
        await p.getByRole('button', { name: 'Add a section', exact: true }).click()
        const lib = p.getByRole('dialog', { name: 'Add a section' })
        await lib.getByRole('button', { name: /^Designs/ }).click()
        await lib.getByRole('button', { name: /^The drop/ }).click()
        await p.getByRole('heading', { name: 'The drop', level: 2 }).waitFor()
        await p.getByLabel('Drop date (India time)').fill('2026-12-20T19:00')
        await p.getByRole('group', { name: 'Pieces' }).getByRole('button', { name: 'A collection' }).click()
        await p.getByLabel('Collection', { exact: true }).selectOption(PREFIX)
        await until(async () => { const d = await draft(); const s = JSON.stringify(d?.settings ?? {}); return s.includes('2026-12-20T19:00:00+05:30') && s.includes(`"handle":"${PREFIX}"`) }, 10_000)
        await p.screenshot({ path: t.out('commerce-form') })
      })

      await t.step('A design\'s loop: Behind the bench takes a video in its form, asks Mux for 720p, and the preview plays it', async () => {
        await p.getByRole('button', { name: 'Add a section', exact: true }).click()
        const lib = p.getByRole('dialog', { name: 'Add a section' })
        await lib.getByRole('button', { name: /^Designs/ }).click()
        await lib.getByRole('button', { name: /^Behind the bench/ }).click()
        await p.getByRole('heading', { name: 'Behind the bench', level: 2 }).waitFor()
        await p.locator(VIDEO_INPUT).setInputFiles({ name: 'loop.mp4', mimeType: 'video/mp4', buffer: MP4 })
        await p.getByText('Replace video').waitFor({ state: 'attached', timeout: 30_000 })
        const [v] = await db`select id, playback_id, mp4, mp4_ready_at from videos where tenant_id = ${KESAR} order by created_at desc limit 1`
        assert.equal(v.mp4, '720p'); assert.ok(v.mp4_ready_at, 'the 720p MP4 is ready')
        await until(async () => JSON.stringify((await draft())?.settings ?? {}).includes(v.id), 10_000)
        const loop = p.frameLocator(FRAME).locator(`[data-design="behind-the-bench"] video[data-loop*="${v.playback_id}"]`)
        await loop.waitFor({ state: 'attached' })
        assert.match(await loop.getAttribute('data-loop') ?? '', /\/720p\.mp4$/)
        await p.screenshot({ path: t.out('commerce-design-loop') })
      })

      await t.step('The worst page a 1.5 owner can newly make, published', async () => {
        const d = await draft()
        const home = (d.settings.home ?? []).filter((s) => s.key !== 'design').map((s, i) => ['hero', 'image_text'].includes(s.key) ? { ...s, image: photo(40 + i) } : s)
        const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 16) + ':00+05:30'
        // The worst a 1.5 owner can newly make (speed review): two drops (8 cards; cards outweigh tiles), two other
        // designs, words filled to the page's limit; the designs open the page, so the lead design's eager rule is the
        // one measured. The limits the save holds are asserted here (the page is written by SQL).
        const drop = (id, handle) => ({ id, key: 'design', design: 'the-drop', fill: { heading: { kind: 'heading', text: deva(60) }, date: { kind: 'date', at: soon }, pieces: { kind: 'product_grid', source: { kind: 'collection', handle } }, button: { kind: 'button', label: 'Shop the drop', link: `/collections/${handle}` } } })
        const designs = [
          drop('w-drop', PREFIX), drop('w-drop-b', `${PREFIX}-b`),
          { id: 'w-bench', key: 'design', design: 'behind-the-bench', fill: { heading: { kind: 'heading', text: deva(60) }, story: { kind: 'text', body: [[{ text: deva(600) }], [{ text: deva(600) }], [{ text: deva(600) }]] }, video: { kind: 'video', poster: photo(60) } } },
          { id: 'w-size', key: 'design', design: 'size-help', fill: { heading: { kind: 'heading', text: deva(60) }, intro: { kind: 'text', body: [[{ text: deva(600) }]] }, photo: { kind: 'image', image: photo(61) },
            faq: { kind: 'accordion', items: Array.from({ length: 12 }, (_, i) => ({ q: `${i + 1}. ${deva(76)}`, a: deva(600) })) } } },
        ]
        // Answers trimmed until the words fill the page's limit and no more.
        const size = designs[3].fill.faq
        while (designs.reduce((n, x) => n + fillBytes(x.fill), 0) > TEXT_BYTES) for (const it of size.items) it.a = it.a.slice(0, -1)
        const bytes = designs.reduce((n, x) => n + fillBytes(x.fill), 0)
        assert.ok(bytes > TEXT_BYTES - 200 && bytes <= TEXT_BYTES, `the designs' words fill the page's limit (${bytes} B)`)
        await db`update shop_theme_revisions set settings = ${db.json({ ...d.settings, home: [...designs, ...home] })} where id = ${d.id}`
        await p.reload()
        await p.getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('dialog', { name: 'Publish Signal?' }).getByRole('button', { name: 'Publish', exact: true }).click()
        await p.getByRole('dialog', { name: 'Your shop has its new look' }).waitFor()
      })

      await t.step(`Home from the cache: holds every design, then HTML ≤ ${BUDGET.html / 1024} kB, RSC ≤ ${BUDGET.rsc / 1024} kB, ≤ ${BUDGET.eager} eager images`, async () => {
        // The catalogue is cached for up to 60 s: wait until Home shows the seeded pieces in The drop.
        await until(async () => (await get('/')).body.toString().includes(`/products/${PREFIX}-0`), 150_000)
        const html = await cached('/'), rsc = await cached('/', { RSC: '1' })
        const text = html.body.toString()
        for (const want of ['data-design="the-drop"', 'data-design="behind-the-bench"', 'data-design="size-help"', `/products/${PREFIX}-6`, 'Drops ', 'background-image']) assert.ok(text.includes(want), `Home holds ${want}`)
        const drops = [...text.matchAll(/data-design="the-drop"[\s\S]*?<\/section>/g)].map((m) => (m[0].match(/class="store-card/g) ?? []).length)
        assert.deepEqual(drops, [4, 4], 'each drop shows 4 pieces')
        const kb = (n) => `${(n / 1024).toFixed(1)} kB`
        // Where the bytes are, section by section (each section opens with its data-section marker).
        const parts = text.split(/(?=<div data-section=")/).slice(1).map((x) => [x.match(/data-section="([^"]+)"/)[1], Buffer.byteLength(x)])
        console.log(`     commerce › by section: ${parts.map(([k, n]) => `${k} ${kb(n)}`).join(', ')}`)
        writeFileSync(t.out('commerce-home').replace(/\.png$/, '.html'), html.body)
        console.log(`     commerce › Home: HTML ${kb(html.body.length)}, RSC ${kb(rsc.body.length)}, eager ${eagerOf(text)}`)
        assert.ok(html.body.length <= BUDGET.html, `Home HTML is ${kb(html.body.length)}`)
        assert.ok(rsc.body.length <= BUDGET.rsc, `Home RSC is ${kb(rsc.body.length)}`)
        assert.ok(eagerOf(text) <= BUDGET.eager, `Home asks for ${eagerOf(text)} images first`)
      })

      await t.step('Shop all and a collection: ≤ 2 eager images each', async () => {
        for (const path of ['/products', `/collections/${PREFIX}`]) {
          const r = await cached(path)
          assert.ok(eagerOf(r.body.toString()) <= BUDGET.eager, `${path} asks for ${eagerOf(r.body.toString())} images first`)
        }
      })

      await t.step('Undo last publish: the designs leave the shop', async () => {
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'More' }).click()
        await p.getByRole('menuitem', { name: 'Undo last publish' }).click()
        await p.getByRole('dialog', { name: /back on your shop\?$/ }).getByRole('button', { name: 'Put it back' }).click()
        await until(async () => !(await get('/')).body.toString().includes('data-design="the-drop"'), 15_000)
      })
    } finally {
      await ctx.close()
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from shop_theme_publishes where tenant_id = ${KESAR} and revision_id in (select id from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal')`
        await x`delete from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal'`
        await x`delete from theme_versions where theme_key = 'signal'`
      })
      await db`delete from collection_products where tenant_id = ${KESAR} and collection_id in ${db(cols.map((c) => c.id))}`
      await db`delete from collections where tenant_id = ${KESAR} and id in ${db(cols.map((c) => c.id))}`
      await db`delete from product_colours where tenant_id = ${KESAR} and product_id in ${db(ids.map((x) => x.id))}`
      await db`delete from product_images where tenant_id = ${KESAR} and product_id in ${db(ids.map((x) => x.id))}`
      await db`delete from variants where tenant_id = ${KESAR} and product_id in ${db(ids.map((x) => x.id))}`
      await db`delete from products where tenant_id = ${KESAR} and id in ${db(ids.map((x) => x.id))}`
    }
  },
}
