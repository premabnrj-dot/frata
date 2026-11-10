// =============================================================================
// FLOW: product video PV·1 (docs/plans/2026-11-10-product-video-pv1.md) against the fake Mux (e2e/fakes/mux.mjs).
// The owner adds a reel to Chanderi kurta set: it goes straight to "Mux", asks for one 720p MP4 and an hour to upload,
// and the card says Ready with its shape and length. The owner picks a cover frame and the button's words. The shop
// shows the video second in the gallery and "See it on a model · 0:24" beside the sizes; either opens the viewer
// (the 720p MP4, Add to bag, Escape returns focus). A Look discard leaves it alone. Remove deletes it at Mux. A 70 s
// file is too long, a 3 s one too short, one under 720p says so; each asset is deleted.
// Guards: a product video deleted by the Look's cleanup; the shop downloading video before a tap; a lost upload.
// =============================================================================
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONSOLE, PORTS, SHOP, USERS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const MP4 = readFileSync(new URL('../fixtures/loop.mp4', import.meta.url))
const fake = async () => (await fetch(`http://localhost:${PORTS.mux}/_test/state`)).json()
const VIDEO_INPUT = 'input[type=file][accept="video/mp4,video/quicktime"]'
const PRODUCT = '/console/products/chanderi-kurta-set'

export default {
  name: 'product-video',
  async run(t) {
    const { db } = t
    const cleanup = async () => {
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from product_videos where tenant_id = ${KESAR}`
        await x`delete from shop_theme_revisions where tenant_id = ${KESAR} and id not in (select revision_id from shop_theme_publishes)`
        await x`delete from outbox where tenant_id = ${KESAR} and kind like 'mux.%'`
        await x`delete from webhook_events where tenant_id = ${KESAR} and provider = 'mux'`
        await x`delete from videos where tenant_id = ${KESAR}`
      })
    }
    await cleanup()
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 900 } })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    const card = () => p.getByRole('region', { name: 'Video' })
    const latest = async () => (await db`select id, upload_id, asset_id, playback_id, mp4_ready_at, duration_ms, width, height, error, removed_at, use from videos where tenant_id = ${KESAR} order by created_at desc limit 1`)[0]
    try {
      let v
      await t.step('Add a video: straight to Mux as a product video (720p, an hour); Ready says reel and 0:24', async () => {
        await p.goto(CONSOLE + PRODUCT)
        await card().getByText('Add a video').waitFor()
        await p.locator(VIDEO_INPUT).setInputFiles({ name: 'reel.mov', mimeType: 'video/quicktime', buffer: MP4 })
        await card().getByText('Reel · 9:16').waitFor({ timeout: 30_000 })
        await card().getByText('0:24').first().waitFor()
        v = await latest()
        assert.equal(v.use, 'product'); assert.ok(v.playback_id && v.mp4_ready_at, 'playable')
        assert.deepEqual([v.width, v.height, v.duration_ms], [1080, 1920, 24400])
        const up = (await fake()).uploads.find((u) => u.id === v.upload_id)
        assert.equal(up.new_asset_settings.static_renditions, undefined, 'no MP4 asked for at upload'); assert.equal(up.timeout, 3600)
        assert.deepEqual((await fake()).renditions.filter((r) => r.asset === v.asset_id).map((r) => r.resolution), ['720p'], 'the 720p, once, after the checks')
        const [link] = await db`select video_id, button, poster_ms from product_videos where tenant_id = ${KESAR}`
        assert.equal(link.video_id, v.id); assert.equal(link.button, 'model')
      })

      await t.step('Cover frame and the button’s words are saved', async () => {
        await card().getByRole('button', { name: 'Frame at 6 seconds' }).click()
        await card().getByRole('button', { name: 'How to wear' }).click()
        await until(async () => { const [l] = await db`select button, poster_ms from product_videos where tenant_id = ${KESAR}`; return l.button === 'wear' && l.poster_ms === 6000 }, 10_000)
        await card().getByRole('button', { name: 'See it on a model' }).click()
        await until(async () => { const [l] = await db`select button from product_videos where tenant_id = ${KESAR}`; return l.button === 'model' }, 10_000)
      })

      await t.step('The shop: the tile second, nothing downloaded before a tap; the viewer plays the 720p MP4; Add to bag; Escape', async () => {
        const s = await t.browser.newContext({ viewport: { width: 390, height: 844 } }); const q = await s.newPage(); q.setDefaultTimeout(15_000)
        const media = []; q.on('request', (r) => { if (/\.mp4/.test(r.url())) media.push(r.url()) })
        await until(async () => { await q.goto(SHOP + '/products/chanderi-kurta-set'); return (await q.getByRole('button', { name: 'Play video, 0:24' }).count()) > 0 }, 70_000)
        const tile = q.getByRole('button', { name: 'Play video, 0:24' })
        const items = await q.getByRole('list', { name: /photos/i }).first().getByRole('listitem').all()
        assert.ok(items.length >= 2 && (await items[1].getByRole('button', { name: 'Play video, 0:24' }).count()) === 1, 'the video is second')
        const opener = q.getByRole('button', { name: 'See it on a model · 0:24' })
        await opener.waitFor()
        await q.waitForTimeout(800)
        assert.equal(media.length, 0, 'no video before a tap')
        await opener.click()
        const dlg = q.getByRole('dialog', { name: 'Video: Chanderi kurta set' })
        await dlg.waitFor()
        const src = await dlg.locator('video').evaluate((el) => el.currentSrc || el.getAttribute('src'))
        assert.match(src, new RegExp(`/${v.playback_id}/720p\\.mp4$`))
        await dlg.getByRole('button', { name: 'Pause' }).waitFor()
        await dlg.getByRole('button', { name: /^M$/ }).click()
        await dlg.getByRole('button', { name: /^Add to bag/ }).click()
        await q.keyboard.press('Escape')
        await dlg.waitFor({ state: 'hidden' })
        assert.equal(await opener.evaluate((el) => el === document.activeElement), true, 'focus back on what opened it')
        await tile.click()
        await dlg.waitFor()
        await q.keyboard.press('Escape')
        await s.close()
      })

      await t.step('A Look discard leaves the product video alone', async () => {
        await db`update videos set created_at = now() - interval '3 hours' where id = ${v.id}`
        await db`insert into shop_theme_revisions (tenant_id, theme_key, theme_version, style_key, settings, created_by, updated_by) values (${KESAR}, 'minimal', '1.0.0', 'ink', '{}', ${USERS.owner.id}, ${USERS.owner.id})`
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'More' }).click()
        await p.getByRole('menuitem', { name: 'Discard draft' }).click()
        await p.getByRole('dialog', { name: 'Discard your draft?' }).getByRole('button', { name: 'Discard' }).click()
        await until(async () => (await db`select count(*)::int n from shop_theme_revisions where tenant_id = ${KESAR} and id not in (select revision_id from shop_theme_publishes)`)[0].n === 0, 10_000)
        await p.waitForTimeout(1500)
        const [row] = await db`select removed_at from videos where id = ${v.id}`
        assert.equal(row.removed_at, null, 'still live'); assert.ok(!(await fake()).deleted.includes(v.asset_id), 'never deleted at Mux')
      })

      await t.step('Remove: confirmed; the link goes and the asset is deleted at Mux', async () => {
        await p.goto(CONSOLE + PRODUCT)
        await card().getByRole('button', { name: 'Remove' }).click()
        await p.getByRole('dialog', { name: 'Remove the video?' }).getByRole('button', { name: 'Remove video' }).click()
        await card().getByText('Add a video').waitFor()
        await until(async () => (await fake()).deleted.includes(v.asset_id), 15_000)
        assert.equal((await db`select count(*)::int n from product_videos where tenant_id = ${KESAR}`)[0].n, 0)
      })

      for (const [mark, words, error] of [['XLONG', '1:10 is too long', 'too_long'], ['SHORT', 'at least 0:06', 'too_short'], ['SMALL', 'at least 720p', 'too_small']]) {
        await t.step(`${mark}: says “${words}”, and its asset is deleted`, async () => {
          await p.goto(CONSOLE + PRODUCT)
          await p.locator(VIDEO_INPUT).setInputFiles({ name: 'x.mp4', mimeType: 'video/mp4', buffer: Buffer.concat([MP4, Buffer.from(mark)]) })
          await card().getByText(words).waitFor({ timeout: 30_000 })
          const r = await latest()
          assert.equal(r.error, error)
          await until(async () => (await fake()).deleted.includes(r.asset_id), 15_000)
          assert.ok(!(await fake()).renditions.some((x) => x.asset === r.asset_id), 'no 720p prep for a refused video')
          await card().getByRole('button', { name: 'Choose another' }).waitFor()
        })
      }
    } finally {
      await ctx.close()
      await cleanup()
    }
  },
}
