// =============================================================================
// FLOW: video V1 (docs/plans/2026-11-09-video-v1.md) against the fake Mux (e2e/fakes/mux.mjs). Signal 1.1.0 offers a
// loop in Image with text: the file goes from the browser straight to "Mux", the signed webhook comes back, the field
// says Ready, the preview plays the loop over its photo. A 20-second file is refused and its asset deleted; Remove
// only changes the draft, and Discard deletes the unused video at Mux. The webhook refuses an unsigned call and
// ignores another Mux environment. Cleans up its draft, its release rows, its videos and the shop's categories.
// =============================================================================
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { CONSOLE, MUX, PORTS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const FRAME = 'iframe[title="Your shop with this look"]'
const MP4 = readFileSync(new URL('../fixtures/loop.mp4', import.meta.url))
const fake = async () => (await fetch(`http://localhost:${PORTS.mux}/_test/state`)).json()
const VIDEO_INPUT = 'input[type=file][accept="video/mp4,video/quicktime"]'

export default {
  name: 'video',
  async run(t) {
    const { db } = t
    const [{ sells }] = await db`select sells from shop_settings where tenant_id = ${KESAR}`
    const cleanup = async () => {
      await db`update shop_settings set sells = ${sells} where tenant_id = ${KESAR}`
      await db.begin(async (x) => {
        await x`set local session_replication_role = replica`
        await x`delete from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' and id not in (select revision_id from shop_theme_publishes)`
        await x`delete from theme_versions where theme_key = 'signal' and version = '1.1.0'`
        await x`delete from outbox where tenant_id = ${KESAR} and kind like 'mux.%'`
        await x`delete from webhook_events where tenant_id = ${KESAR} and provider = 'mux'`
        await x`delete from videos where tenant_id = ${KESAR}`
      })
    }
    // Motion on (the suite's default is reduced, where a loop rightly never loads: checked below).
    const ctx = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
    const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(`${e.message} at ${p.url()}`))
    const addStory = async () => {
      await p.getByRole('tab', { name: 'Sections' }).click()
      const back = p.getByRole('button', { name: '‹ Sections' })
      if (await back.isVisible()) await back.click()
      await p.getByRole('button', { name: 'Add a section', exact: true }).click()
      const lib = p.getByRole('dialog', { name: 'Add a section' })
      await lib.getByPlaceholder('Search sections').fill('story')
      await lib.getByRole('button', { name: /^Image with text/ }).click()
    }
    try {
      await t.step('Signal 1.1.0 in a draft: the Hero offers a video', async () => {
        await db`insert into theme_versions (theme_key, version, released_at) values ('signal', '1.0.0', now()), ('signal', '1.1.0', now()) on conflict (theme_key, version) do update set released_at = now(), recalled_at = null, withdrawn_at = null`
        await db`update shop_settings set sells = '{accessories}' where tenant_id = ${KESAR}`
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'Signal', exact: true }).click()
        const d = p.getByRole('dialog', { name: 'Signal' })
        await d.getByText('Version 1.1.0').waitFor()
        await d.getByRole('button', { name: 'Try Signal in a draft' }).click()
        const ask = p.getByRole('dialog', { name: 'Try Signal?' })
        await Promise.race([ask.waitFor().then(() => ask.getByRole('button', { name: 'Try Signal' }).click()), p.waitForURL(/\/console\/look\/customize$/)])
        await p.waitForURL(/\/console\/look\/customize$/)
        // A shop that customised its home before carries those sections over; this checks Signal's own hero.
        await db`update shop_theme_revisions set settings = settings - 'home' where tenant_id = ${KESAR} and theme_key = 'signal' and id not in (select revision_id from shop_theme_publishes)`
        await p.reload()
        await p.getByRole('tab', { name: 'Sections' }).click()
        // The Hero over a photo (the preview fills Signal's sample scene until the shop adds its own).
        await p.getByRole('button', { name: /^Hero/ }).first().click()
        await p.getByText('Add a video').waitFor()
      })

      let first
      await t.step('Add a video: uploading, getting it ready, ready; the preview plays the loop over the photo', async () => {
        await p.locator(VIDEO_INPUT).setInputFiles({ name: 'loop.mp4', mimeType: 'video/mp4', buffer: MP4 })
        await p.getByText('Replace video').waitFor({ state: 'attached', timeout: 30_000 })
        ;[first] = await db`select id, upload_id, asset_id, playback_id, mp4_ready_at, duration_ms, mux_env from videos where tenant_id = ${KESAR} order by created_at desc limit 1`
        assert.ok(first.upload_id && first.asset_id && first.playback_id && first.mp4_ready_at, 'the row is playable')
        assert.equal(first.mux_env, MUX.env); assert.equal(first.duration_ms, 1000)
        const st = await fake()
        const up = st.uploads.find((u) => u.id === first.upload_id)
        assert.equal(up.new_asset_settings.passthrough, first.id, 'Mux carries our row id')
        assert.deepEqual(up.new_asset_settings.static_renditions, [{ resolution: '720p' }, { resolution: 'highest' }]); assert.equal(up.timeout, 900); assert.equal(up.cors_origin, CONSOLE)
        // Saved into the draft, and the preview draws it over the section's photo, then plays it once in view.
        await until(async () => { const [r] = await db`select settings from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`; return JSON.stringify(r.settings).includes(first.id) }, 10_000)
        const loop = p.frameLocator(FRAME).locator(`video[data-loop*="${first.playback_id}"]`)
        await loop.waitFor({ state: 'attached' })
        await loop.scrollIntoViewIfNeeded()
        await until(async () => !(await loop.getAttribute('class')).includes('opacity-0'), 15_000)
        assert.equal(await loop.evaluate((v) => v.muted && v.loop && !v.paused), true, 'muted, looping, playing')
        await p.screenshot({ path: t.out('video-ready') })
        // Reduced motion: the photo stays and the loop never loads (no source, nothing fetched).
        const still = await signedIn(t.browser, 'owner', { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
        const q = await still.newPage()
        const [rev] = await db`select id from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`
        await q.goto(CONSOLE + `/console/theme-preview/${rev.id}`)
        const quiet = q.locator(`video[data-loop*="${first.playback_id}"]`)
        await quiet.waitFor({ state: 'attached' })
        await q.waitForTimeout(1000)
        assert.equal(await quiet.evaluate((v) => v.currentSrc === '' && v.paused), true, 'no loop under reduced motion')
        await still.close()
      })

      await t.step('Remove changes the draft only: the video stays at Mux until no look uses it', async () => {
        await p.getByText('Remove video').click()
        await until(async () => { const [r] = await db`select settings from shop_theme_revisions where tenant_id = ${KESAR} and theme_key = 'signal' order by updated_at desc limit 1`; return !JSON.stringify(r.settings).includes(first.id) }, 10_000)
        const [v] = await db`select removed_at from videos where id = ${first.id}`
        assert.equal(v.removed_at, null)
        assert.ok(!(await fake()).deleted.includes(first.asset_id))
      })

      await t.step('A 20-second video: didn’t work, it’s too long; its asset is deleted', async () => {
        await addStory()
        await p.locator(VIDEO_INPUT).setInputFiles({ name: 'long.mp4', mimeType: 'video/mp4', buffer: Buffer.concat([MP4, Buffer.from('LONG')]) })
        await p.getByText('longer than 15 seconds').waitFor({ timeout: 30_000 })
        const [v] = await db`select asset_id, playback_id, error from videos where tenant_id = ${KESAR} order by created_at desc limit 1`
        assert.equal(v.error, 'too_long'); assert.equal(v.playback_id, null, 'no playback id for a refused loop')
        await until(async () => (await fake()).deleted.includes(v.asset_id), 15_000)
      })

      await t.step('Discard: a video no look uses is removed and deleted at Mux', async () => {
        // Older than an upload could still be (a young one may be mid-upload, not yet in the draft).
        await db`update videos set created_at = now() - interval '3 hours' where id = ${first.id}`
        await p.goto(CONSOLE + '/console/look')
        await p.getByRole('button', { name: 'More' }).click()
        await p.getByRole('menuitem', { name: 'Discard draft' }).click()
        await p.getByRole('dialog', { name: 'Discard your draft?' }).getByRole('button', { name: 'Discard' }).click()
        await until(async () => { const [v] = await db`select removed_at from videos where id = ${first.id}`; return v.removed_at !== null }, 10_000)
        await until(async () => (await fake()).deleted.includes(first.asset_id), 15_000)
      })

      await t.step('The webhook: unsigned is refused; another Mux environment is ignored', async () => {
        const post = (raw, sig) => fetch(`${CONSOLE}/api/webhooks/mux`, { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'mux-signature': sig } : {}) }, body: raw })
        const raw = JSON.stringify({ type: 'video.asset.ready', id: crypto.randomUUID(), environment: { id: 'someoneelse' }, data: { id: first.asset_id, upload_id: first.upload_id, passthrough: first.id, status: 'ready' } })
        assert.equal((await post(raw)).status, 401)
        assert.equal((await post(raw, 't=1,v1=' + '0'.repeat(64))).status, 401)
        const ts = Math.floor(Date.now() / 1000)
        const r = await post(raw, `t=${ts},v1=${crypto.createHmac('sha256', MUX.webhook).update(`${ts}.${raw}`).digest('hex')}`)
        assert.equal(r.status, 200)
        const [{ n }] = await db`select count(*)::int n from webhook_events where provider = 'mux' and event_key like 'mux:someoneelse:%'`
        assert.equal(n, 0, 'nothing stored from another environment')
      })
    } finally {
      await ctx.close()
      await cleanup()
    }
  },
}
