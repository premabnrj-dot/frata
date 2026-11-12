// =============================================================================
// FLOW: product import PI·1 (docs/plans/2026-11-12-product-import.md § Tasks 7; the plan's "flow 75", renumbered: 75
// is staff passkeys). The shop stress test's broken sheet (src/domains/catalogue/import/__tests__/fixtures/stress.xlsx):
// a file Frrata can't read is refused in words; the sheet's check counts 9 new and 2 left out, names each problem by
// row and column, lists Supplier and Notes as not imported, and its rows-to-fix file makes formulas inert; Import 9
// as drafts writes 9 drafts (costs for the owner), ends the job and forgets its cells. On a phone, staff checking the
// same sheet as CSV see it all in the shop already (a SKU in the shop matches) and no cost column; the owner deletes the import's drafts.
// Photos by file name (PI·2): from Done's "Add photos", 12 phone photos matched by SKU, a SKU's start, address, a Hindi
// name, a name with "(2)", and a colour word; one named IMG_… and one that fits two products ask "Which product?"; the
// first upload refused by storage is a toast with Try again; each lands on its product in its place (Blob stood in by
// the browser's network, as the Vercel Blob client calls it). On a phone, staff see a photo that asks.
// Guards: a draft that reaches the shop; a cost from staff; a cell kept after the job; a formula in the fix file; a
// photo on the wrong product or out of its place; a colour photo without its colour.
// =============================================================================
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONSOLE, PORTS, USERS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const FIXTURES = new URL('../../src/domains/catalogue/import/__tests__/fixtures/', import.meta.url)
const XLSX = readFileSync(new URL('stress.xlsx', FIXTURES))
const CSV = readFileSync(new URL('stress.csv', FIXTURES))
const INPUT = 'input[type=file][aria-label="Choose a spreadsheet"]'
const STORE = 'https://e2e.public.blob.vercel-storage.com' // BLOB_STORE_ID store_e2e (stack.mjs)
/** Photos the browser makes (a JPEG, or PNG/WebP), each `w` px wide so the database tells which file is which. */
async function makePhotos(page, specs) {
  const made = await page.evaluate(async (list) => Promise.all(list.map(async ({ name, w, type }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * 1.25)
    const g = c.getContext('2d'); g.fillStyle = `hsl(${w % 360} 50% 60%)`; g.fillRect(0, 0, c.width, c.height)
    const blob = await new Promise((r) => c.toBlob(r, type, 0.8))
    const bytes = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b)
    return { name, mimeType: type, b64: btoa(bin) }
  })), specs)
  return made.map((f) => ({ name: f.name, mimeType: f.mimeType, buffer: Buffer.from(f.b64, 'base64') }))
}
/**
 * Vercel Blob's upload API as the client calls it (PUT https://vercel.com/api/blob/?pathname=…); `refuse` the first n.
 * What it takes goes to the stand-in store (e2e/fakes/blob.mjs), where the app reads each file's first bytes.
 */
async function fakeBlob(ctx, refuse = 0) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT, OPTIONS', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' }
  const seen = []
  await ctx.route(/^https:\/\/vercel\.com\/api\/blob\//, async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const pathname = new URL(req.url()).searchParams.get('pathname')
    seen.push(pathname)
    if (refuse > 0) { refuse--; return route.fulfill({ status: 403, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ error: { code: 'forbidden', message: 'Access denied' } }) }) }
    const kept = await fetch(`http://127.0.0.1:${PORTS.blob}/_test/put?pathname=${encodeURIComponent(pathname)}`, { method: 'PUT', body: req.postDataBuffer() ?? Buffer.alloc(0) })
    assert.equal(kept.status, 200)
    const url = `${STORE}/${pathname}`
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ url, downloadUrl: `${url}?download=1`, pathname, contentType: req.headers()['x-content-type'] ?? 'image/webp', contentDisposition: 'inline' }) })
  })
  return seen
}
const HANDLES = ['anarkali-kurta-set', 'chanderi-dupatta', 'linen-co-ord', 'block-print-kurta', 'banarasi-sari', 'mul-cotton-nightsuit', 'bandhani-dupatta', 'phulkari-jacket', 'ikat-palazzo']

export default {
  name: 'import',
  async run(t) {
    const { db } = t
    const cleanup = async () => {
      await db`delete from import_rows where tenant_id = ${KESAR}`
      await db`delete from import_jobs where tenant_id = ${KESAR}`
      await db`delete from products where tenant_id = ${KESAR} and handle = any(${HANDLES})`
    }
    await cleanup()
    const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await owner.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    try {
      await t.step('File: Products leads to Import; the drop zone and the three starts; a file it can\'t read is refused in words', async () => {
        await p.goto(CONSOLE + '/console/products')
        await p.getByRole('link', { name: 'Import', exact: true }).click()
        await p.waitForURL(/\/console\/products\/import$/)
        await p.getByRole('heading', { name: 'Import products', level: 1 }).waitFor()
        await p.getByText('Drop a spreadsheet').waitFor()
        await p.getByRole('link', { name: 'Download our template' }).waitFor()
        await p.screenshot({ path: t.out('import-file') })
        await p.locator(INPUT).setInputFiles({ name: 'catalogue.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
        await p.getByRole('alert').getByText('We can’t read this file. Save it as .xlsx or .csv.').waitFor()
      })

      await t.step('Check: 9 new, 2 left out by row and column; Supplier and Notes not imported; the first 3 as they will look', async () => {
        await p.locator(INPUT).setInputFiles({ name: 'kesar-catalogue.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX })
        const counts = p.getByRole('group', { name: 'What this file does' })
        await counts.getByText('Left out until fixed').waitFor()
        assert.match(await counts.innerText(), /9\s+New products · 21 sizes and colours\s+0\s+Already in your shop\s+2\s+Left out until fixed/)
        const fix = p.getByRole('table', { name: 'Rows to fix' })
        await fix.getByText('"Rs 1,2,99" isn\'t a price').waitFor()
        await fix.getByText('KS-BPK-M is also on row 5').waitFor()
        await p.getByText('“Supplier”, “Notes”').waitFor()
        await p.getByText('Only you see it').waitFor()
        await p.getByRole('table', { name: 'Preview' }).getByText('चंदेरी दुपट्टा', { exact: true }).waitFor()
        await p.getByText('/chanderi-dupatta').waitFor()
        await p.getByRole('button', { name: 'Import 9 as drafts' }).waitFor()
        await p.screenshot({ path: t.out('import-check'), fullPage: true })
      })

      await t.step('Rows to fix: the file\'s columns and What to fix, the two products only, a formula made inert', async () => {
        const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download rows to fix' }).click()])
        const text = readFileSync(await download.path(), 'utf8')
        const lines = text.replace(/^\uFEFF/, '').trim().split(/\r\n/)
        assert.equal(lines[0], 'Item,Size,MRP,Qty,SKU,Purchase price,Supplier,Notes,What to fix')
        assert.equal(lines.length, 3)
        assert.ok(lines.some((l) => l.includes("'=SUM(A1:A9)")), 'the formula starts with a quote')
      })

      await t.step('Import 9 as drafts: nine drafts with the owner\'s costs, none on the shop, the job ended and its cells gone', async () => {
        await p.getByRole('button', { name: 'Import 9 as drafts' }).click()
        await p.getByText('9 products added as drafts').waitFor({ timeout: 30_000 })
        const tiles = p.getByRole('group', { name: 'What the drafts need' })
        await tiles.getByText('Need photos').waitFor()
        assert.match(await tiles.innerText(), /9\s+Need photos/)
        await tiles.getByRole('link', { name: 'Add photos' }).waitFor()
        const made = await db`select p.handle, p.status, p.published_at, min(v.unit_cost)::int cost, count(v.*)::int sizes from products p join variants v on v.product_id = p.id
          where p.tenant_id = ${KESAR} and p.handle = any(${HANDLES}) group by p.id order by p.handle`
        assert.equal(made.length, 9)
        assert.ok(made.every((m) => m.status === 'draft' && m.published_at === null), 'drafts only')
        assert.deepEqual(made.find((m) => m.handle === 'anarkali-kurta-set'), { handle: 'anarkali-kurta-set', status: 'draft', published_at: null, cost: 110000, sizes: 3 })
        const [job] = await db`select added, left_out, finished_at, (select count(*)::int from import_rows r where r.job_id = j.id and r.cells is not null) cells from import_jobs j where tenant_id = ${KESAR}`
        assert.deepEqual([job.added, job.left_out, job.finished_at !== null, job.cells], [9, 2, true, 0])
        await p.getByRole('table', { name: 'Import history' }).getByRole('cell', { name: 'kesar-catalogue.xlsx' }).waitFor()
        await p.screenshot({ path: t.out('import-done'), fullPage: true })
      })

      await t.step('Photos: 12 matched by file name, two asked "Which product?", the first refused upload tried again; each on its product in its place', async () => {
        // Bandhani comes in two colours here, so a colour word in a name makes a colour photo.
        await db`update products set options = '{Size,Colour}', option_values = '[["Free size"],["Rani","Haldi"]]' where tenant_id = ${KESAR} and handle = 'bandhani-dupatta'`
        const puts = await fakeBlob(owner, 1)
        await p.getByRole('group', { name: 'What the drafts need' }).getByRole('link', { name: 'Add photos' }).click()
        await p.waitForURL(/\/console\/products\/photos\?from=import$/)
        await p.getByRole('heading', { name: 'Add photos', level: 1 }).waitFor()
        await p.getByText('Name photos by SKU or product').waitFor()
        await p.getByText('Drop photos').waitFor()
        await p.screenshot({ path: t.out('import-photos-empty') })
        const J = 'image/jpeg'
        const files = await makePhotos(p, [
          { name: 'KS-ANR-1.jpg', w: 410, type: J }, { name: 'KS-ANR-2.jpg', w: 420, type: J }, { name: 'anarkali-kurta-set-3.jpg', w: 430, type: J },
          { name: 'चंदेरी दुपट्टा (1).jpg', w: 440, type: J }, { name: 'Linen co-ord (2).jpeg', w: 450, type: J }, { name: 'linen-co-ord-1.jpg', w: 460, type: J },
          { name: 'KS-BPK-M.jpg', w: 470, type: J }, { name: 'bandhani-dupatta-rani-1.jpg', w: 480, type: J }, { name: 'Mul Cotton Nightsuit.png', w: 490, type: 'image/png' },
          { name: 'phulkari-jacket-1.webp', w: 500, type: 'image/webp' }, { name: 'IMG_4021.jpg', w: 510, type: J }, { name: 'chanderi-2.jpg', w: 520, type: J },
        ])
        await p.locator('input[type=file][aria-label="Choose photos"]').setInputFiles(files)
        const card = p.getByRole('region', { name: /^12 photos · \d+ products$/ })
        await card.getByText('2 not matched', { exact: true }).waitFor()
        await card.locator('[data-photo="KS-ANR-2.jpg"]').getByText('Photo 2 of 3', { exact: true }).waitFor()
        await card.locator('[data-photo="bandhani-dupatta-rani-1.jpg"]').getByText('Rani', { exact: true }).waitFor()
        await card.locator('[data-photo="चंदेरी दुपट्टा (1).jpg"]').getByText('चंदेरी दुपट्टा', { exact: true }).waitFor()
        await p.screenshot({ path: t.out('import-photos-matched'), fullPage: true })
        // IMG_…: found by searching; chanderi-2 fits the dupatta and the seed's Chanderi kurta set: both are offered.
        const img = card.getByRole('combobox', { name: 'Which product is IMG_4021.jpg' })
        await img.fill('ikat'); await p.getByRole('option', { name: /Ikat palazzo/ }).click()
        await card.getByRole('combobox', { name: 'Which product is chanderi-2.jpg' }).focus()
        const offered = p.getByRole('listbox', { name: 'Products for chanderi-2.jpg' })
        await offered.getByRole('option', { name: /Chanderi kurta set/ }).waitFor()
        await offered.getByRole('option', { name: /चंदेरी दुपट्टा/ }).click()
        await card.locator('[data-photo="chanderi-2.jpg"]').getByText('Photo 2 of 2', { exact: true }).waitFor()
        assert.equal(await card.getByText(/not matched/).count(), 0)
        await card.getByRole('button', { name: 'Add 12 photos' }).click()
        // The first upload is refused by storage: a toast that stays, with Try again. The other products' photos are
        // added; that product's photos that did upload wait for it, so Try again attaches them all in their places.
        const alert = p.getByRole('alert').filter({ hasText: 'was refused by photo storage' })
        await alert.waitFor({ timeout: 30_000 })
        const first = Number(/(\d+) photos added/.exec(await alert.innerText())?.[1])
        assert.ok(first >= 9 && first <= 11, `${first} added before Try again`)
        assert.equal(await card.getByText('Not added').count(), 1)
        assert.equal(await card.getByText('Added', { exact: true }).count(), first)
        await p.screenshot({ path: t.out('import-photos-failed'), fullPage: true })
        await alert.getByRole('button', { name: 'Try again' }).click()
        await alert.waitFor({ state: 'detached' })
        await p.getByText(12 - first === 1 ? '1 photo added' : `${12 - first} photos added`, { exact: true }).first().waitFor({ timeout: 30_000 })
        assert.equal(await card.getByText('Added', { exact: true }).count(), 12)
        await p.screenshot({ path: t.out('import-photos-added'), fullPage: true })
        assert.ok(puts.every((path) => path.startsWith(`tenants/${KESAR}/products/`)), 'only this shop\'s products folder')
        const got = await db`select p.handle, i.width, i.option_value, i.position, i.base from product_images i join products p on p.id = i.product_id
          where i.tenant_id = ${KESAR} and p.handle = any(${HANDLES}) order by p.handle, i.position`
        const by = (h) => got.filter((g) => g.handle === h).map((g) => [g.width, g.option_value])
        assert.deepEqual(by('anarkali-kurta-set'), [[410, null], [420, null], [430, null]])
        assert.deepEqual(by('chanderi-dupatta'), [[440, null], [520, null]])
        assert.deepEqual(by('linen-co-ord'), [[460, null], [450, null]])
        assert.deepEqual(by('block-print-kurta'), [[470, null]])
        assert.deepEqual(by('bandhani-dupatta'), [[480, 'Rani']])
        assert.deepEqual([by('mul-cotton-nightsuit'), by('phulkari-jacket'), by('ikat-palazzo')], [[[490, null]], [[500, null]], [[510, null]]])
        assert.ok(got.every((g) => g.base.startsWith(`${STORE}/tenants/${KESAR}/products/`)))
        // Blob is stood in: the files exist nowhere, so the rows go before the drafts are deleted below.
        await db`delete from product_images where tenant_id = ${KESAR} and product_id in (select id from products where tenant_id = ${KESAR} and handle = any(${HANDLES}))`
      })
    } finally {
      await owner.close()
    }

    const S = USERS.staff
    await db`insert into auth.users (id, email, email_confirmed_at) values (${S.id}, ${S.email}, now()) on conflict (id) do nothing`
    await db`insert into members (tenant_id, user_id, role) values (${KESAR}, ${S.id}, 'staff') on conflict do nothing`
    const staff = await signedIn(t.browser, 'staff', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const s = await staff.newPage(); s.setDefaultTimeout(15_000); s.on('pageerror', (e) => t.errors.push(`${e.message} at ${s.url()}`))
    try {
      await t.step('Phone, staff: the same sheet as CSV is in the shop already (Ajrakh too: its SKU is), nothing to import, no cost column', async () => {
        await s.goto(CONSOLE + '/console/products/import')
        await s.getByText('Drop a spreadsheet').waitFor()
        await s.screenshot({ path: t.out('import-file-phone'), fullPage: true })
        await s.locator(INPUT).setInputFiles({ name: 'kesar-catalogue.csv', mimeType: 'text/csv', buffer: CSV })
        const counts = s.getByRole('group', { name: 'What this file does' })
        await counts.getByText('Already in your shop').waitFor()
        assert.match(await counts.innerText(), /0\s+New products · 0 sizes and colours\s+10\s+Already in your shop\s+1\s+Left out until fixed/)
        await s.getByText('Nothing new to import.').waitFor()
        assert.equal(await s.getByRole('button', { name: /^Import \d/ }).count(), 0)
        assert.equal(await s.getByText('Only you see it').count(), 0, 'staff import no cost')
        await s.getByText(/“Purchase price”/).waitFor()
        await s.screenshot({ path: t.out('import-check-phone'), fullPage: true })
        await s.getByRole('button', { name: 'Keep my shop as it is' }).click()
        await s.waitForURL(/\/console\/products$/)
      })

      await t.step('Phone, staff: Products leads to Add photos (under More, PR·1); a matched photo and one that asks, with no sideways scroll', async () => {
        await s.getByRole('main').getByRole('button', { name: 'More' }).click()
        await s.getByRole('menuitem', { name: 'Add photos' }).click()
        await s.waitForURL(/\/console\/products\/photos$/)
        const files = await makePhotos(s, [{ name: 'KS-PHK-1.jpg', w: 600, type: 'image/jpeg' }, { name: 'IMG_0007.jpg', w: 600, type: 'image/jpeg' }])
        await s.locator('input[type=file][aria-label="Choose photos"]').setInputFiles(files)
        await s.getByText('1 not matched', { exact: true }).waitFor()
        await s.getByRole('combobox', { name: 'Which product is IMG_0007.jpg' }).waitFor()
        await s.getByRole('button', { name: 'Add 1 photo' }).waitFor()
        const wide = await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
        assert.equal(wide, false, 'no sideways scroll on a phone')
        await s.screenshot({ path: t.out('import-photos-phone'), fullPage: true })
      })
    } finally {
      await staff.close()
      await db`delete from members where tenant_id = ${KESAR} and user_id = ${S.id}`
    }

    const again = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const o = await again.newPage(); o.setDefaultTimeout(15_000); o.on('pageerror', (e) => t.errors.push(`${e.message} at ${o.url()}`))
    try {
      await t.step('Delete this import\'s drafts: a confirm, then the nine are gone and the file may come again', async () => {
        await o.goto(CONSOLE + '/console/products/import')
        await o.getByRole('table', { name: 'Import history' }).getByRole('button', { name: 'Delete drafts' }).click()
        const dialog = o.getByRole('dialog', { name: 'Delete the drafts from kesar-catalogue.xlsx?' })
        await dialog.getByRole('button', { name: 'Keep the drafts' }).waitFor()
        await dialog.getByRole('button', { name: 'Delete drafts' }).click()
        await o.getByText('Drafts deleted').waitFor()
        await until(async () => (await db`select count(*)::int n from products where tenant_id = ${KESAR} and handle = any(${HANDLES})`)[0].n === 0, 10_000)
        const [job] = await db`select file_hash, drafts_deleted_at from import_jobs where tenant_id = ${KESAR}`
        assert.equal(job.file_hash, null); assert.ok(job.drafts_deleted_at)
      })
    } finally {
      await again.close()
      await cleanup()
    }
  },
}
