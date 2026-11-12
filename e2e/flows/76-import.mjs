// =============================================================================
// FLOW: product import PI·1 (docs/plans/2026-11-12-product-import.md § Tasks 7; the plan's "flow 75", renumbered: 75
// is staff passkeys). The shop stress test's broken sheet (src/domains/catalogue/import/__tests__/fixtures/stress.xlsx):
// a file Frrata can't read is refused in words; the sheet's check counts 9 new and 2 left out, names each problem by
// row and column, lists Supplier and Notes as not imported, and its rows-to-fix file makes formulas inert; Import 9
// as drafts writes 9 drafts (costs for the owner), ends the job and forgets its cells. On a phone, staff checking the
// same sheet as CSV see all 9 already in the shop and no cost column; the owner deletes the import's drafts.
// Guards: a draft that reaches the shop; a cost from staff; a cell kept after the job; a formula in the fix file.
// =============================================================================
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONSOLE, USERS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const FIXTURES = new URL('../../src/domains/catalogue/import/__tests__/fixtures/', import.meta.url)
const XLSX = readFileSync(new URL('stress.xlsx', FIXTURES))
const CSV = readFileSync(new URL('stress.csv', FIXTURES))
const INPUT = 'input[type=file][aria-label="Choose a spreadsheet"]'
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
        await p.getByRole('table', { name: 'Preview' }).getByText('चंदेरी दुपट्टा').waitFor()
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
        await p.getByRole('table', { name: 'Import history' }).getByText('kesar-catalogue.xlsx').waitFor()
        await p.screenshot({ path: t.out('import-done'), fullPage: true })
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
      await t.step('Phone, staff: the same sheet as CSV is all in the shop already, nothing to import, no cost column', async () => {
        await s.goto(CONSOLE + '/console/products/import')
        await s.getByText('Drop a spreadsheet').waitFor()
        await s.screenshot({ path: t.out('import-file-phone'), fullPage: true })
        await s.locator(INPUT).setInputFiles({ name: 'kesar-catalogue.csv', mimeType: 'text/csv', buffer: CSV })
        const counts = s.getByRole('group', { name: 'What this file does' })
        await counts.getByText('Already in your shop').waitFor()
        assert.match(await counts.innerText(), /0\s+New products · 0 sizes and colours\s+9\s+Already in your shop\s+2\s+Left out until fixed/)
        await s.getByText('Nothing new to import.').waitFor()
        assert.equal(await s.getByRole('button', { name: /^Import \d/ }).count(), 0)
        assert.equal(await s.getByText('Only you see it').count(), 0, 'staff import no cost')
        await s.getByText(/“Purchase price”/).waitFor()
        await s.screenshot({ path: t.out('import-check-phone'), fullPage: true })
        await s.getByRole('button', { name: 'Keep my shop as it is' }).click()
        await s.waitForURL(/\/console\/products$/)
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
