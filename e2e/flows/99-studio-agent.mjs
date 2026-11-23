// =============================================================================
// FLOW: studio-agent — Studio's live screen on the fake Managed Agents server (plan docs/plans/2026-11-22-v3a-runtime.md
// R7; states mockup docs/mockups/2026-11-22-studio-runtime-states.html, approved 2026-11-23). Never the live API: the
// stack runs e2e/fakes/anthropic.mjs on loopback and points STUDIO_ANTHROPIC_BASE at it.
// A partner person who is not Frrata staff reads state 1. Made staff, on a test store with no owner yet: state 2; a
// request runs (the agent's work lines, state 3), proposes a warmer accent, and Apply saves it to the store's brand
// record through the console's own save; a logo card refused because the brand changed since (state 9), then applied
// after Reload Brand; Not this; Code and Checks empty (state 8); the store's own preview (state 7); a request at its
// limit (state 4) and Continue request; a Send refused at today's limit (state 6); a request that failed on Frrata's
// side (state 5). axe finds nothing serious at 1280 and 390. Screenshots e2e/.out/99-studio-agent-*.png are what
// mockup-parity-reviewer compares with the states mockup.
// Guards: a person who is not staff in Studio; an Apply that skips the console's save or its version; a key or a cost
// on screen.
// =============================================================================
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { CONSOLE, PORTS, USERS, partnerOn, seedStaffStepup, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const URL = CONSOLE + '/partner/studio'
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const audit = async (p) => {
  await p.addScriptTag({ content: AXE })
  return p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`))
}
const failNext = (path, n = 1) => fetch(`http://127.0.0.1:${PORTS.anthropic}/_test/fail`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, n }) })

export default {
  name: 'studio-agent',
  async run(t) {
    const db = t.db, P = USERS.partner
    await db`insert into auth.users (id, email, email_confirmed_at) values (${P.id}, ${P.email}, now()) on conflict (id) do nothing`
    // A test store with no owner yet, not open, whose website is code (so it has a brand record): Kesar's settings, copied.
    const [{ id: S }] = await db`insert into tenants (slug, name) values (${'e2e-studio-' + Date.now().toString(36)}, 'Kesar test') returning id`
    await db`create temp table studio_shop as select * from shop_settings where tenant_id = ${KESAR}`
    await db`update studio_shop set tenant_id = ${S}, published_at = null, logo_url = null`
    await db`insert into shop_settings select * from studio_shop`
    // A live key makes its website code (as 94-brand does for Kesar): the store has a brand record to change.
    await db`insert into storefront_keys (tenant_id, kind, name, hash, prefix, created_by) values (${S}, 'public', 'Website e2e', ${'f'.repeat(64)}, 'frs_pub_e2estd', ${USERS.owner.id})`
    await partnerOn(db, S, P)
    const day = (await db`select to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as d`)[0].d
    await db`update studio_spend_days set measured_micro = 0, reserved_micro = 0 where day = ${day}`
    await db`delete from studio_spend_people where day = ${day} and user_id = ${P.id}`

    const open = async (viewport) => {
      const ctx = await signedIn(t.browser, 'partner', { viewport, reducedMotion: 'reduce' })
      await ctx.addCookies([{ name: 'frata_tenant', value: S, domain: 'localhost', path: '/' }])
      const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message))
      await p.goto(URL)
      return { ctx, p }
    }

    await t.step('state 1: a partner person who is not Frrata staff', async () => {
      await db`delete from platform_staff where user_id = ${P.id}`
      const { ctx, p } = await open({ width: 1280, height: 860 })
      await p.getByRole('heading', { name: 'Studio isn’t open yet' }).waitFor()
      await p.getByText('Frrata is testing it on one store.').waitFor()
      await p.getByRole('link', { name: 'Open Clients' }).waitFor()
      await p.screenshot({ path: 'e2e/.out/99-studio-agent-1-closed.png' })
      await ctx.close()
    })

    await db`insert into platform_staff (user_id, email, role) values (${P.id}, ${P.email}, 'support') on conflict (user_id) do nothing`

    // The entry states (owner 2026-11-23, docs/mockups/2026-11-23-studio-door.html): staff who are the store's partner
    // learn the one step they miss.
    const entry = async (opts, tenant = S) => {
      const c = await signedIn(t.browser, 'partner', { viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce', ...opts })
      await c.addCookies([{ name: 'frata_tenant', value: tenant, domain: 'localhost', path: '/' }])
      const q = await c.newPage(); q.setDefaultTimeout(15_000); q.on('pageerror', (e) => t.errors.push(e.message))
      await q.goto(URL)
      return { c, q }
    }
    await t.step('1c: no staff passkey yet', async () => {
      await db`delete from staff_stepups where user_id = ${P.id}`; await db`delete from staff_passkeys where user_id = ${P.id}`
      const { c, q } = await entry({ passkey: false })
      await q.getByRole('heading', { name: 'Add a staff passkey' }).waitFor()
      assert.equal(await q.getByRole('link', { name: 'Add staff passkey' }).getAttribute('href'), '/admin')
      assert.deepEqual(await audit(q), [])
      await q.screenshot({ path: 'e2e/.out/99-studio-agent-1c-staff-passkey.png' })
      await c.close()
    })
    await t.step('1b: the checks this sign-in still needs, staff first', async () => {
      await db`insert into staff_passkeys (user_id, credential_id, public_key, name) values (${P.id}, ${'e2e-seed-' + P.id}, 'e2e', 'e2e seed') on conflict (credential_id) do nothing`
      const { c, q } = await entry({ passkey: false })
      await q.getByRole('heading', { name: 'Confirm your passkeys' }).waitFor()
      assert.deepEqual(await q.getByRole('listitem').allTextContents(), ['Staff passkey', 'Partner passkey'])
      await q.getByRole('button', { name: 'Confirm staff passkey' }).waitFor()
      await seedStaffStepup(c, 'partner'); await q.reload()
      await q.getByRole('listitem').filter({ hasText: 'Staff passkey: Done' }).waitFor()
      await q.getByRole('button', { name: 'Confirm partner passkey' }).waitFor()
      assert.deepEqual(await audit(q), [])
      await q.screenshot({ path: 'e2e/.out/99-studio-agent-1b-check.png' })
      await q.setViewportSize({ width: 390, height: 844 })
      assert.equal(await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll at 390')
      await q.getByRole('button', { name: 'Confirm partner passkey' }).waitFor()
      await q.screenshot({ path: 'e2e/.out/99-studio-agent-1b-check-390.png' })
      await c.close()
    })
    await t.step('1a: both checks made, on another store: Open the test store, then Studio', async () => {
      const [{ id: other }] = await db`insert into tenants (slug, name) values (${'e2e-studio-other-' + Date.now().toString(36)}, 'Other shop') returning id`
      await db`insert into members (tenant_id, user_id, role) values (${other}, ${P.id}, 'staff')`
      // One partner store, as drawn: earlier flows link this partner to their stores too (several read state 1).
      const paused = await db`update partner_links l set removed_at = now() from partners p
        where p.id = l.partner_id and p.user_id = ${P.id} and l.tenant_id <> ${S} and l.removed_at is null returning l.tenant_id`
      try {
        const { c, q } = await entry({}, other)
        await q.getByRole('heading', { name: 'Studio runs on Kesar test' }).waitFor()
        assert.deepEqual(await audit(q), [])
        await q.screenshot({ path: 'e2e/.out/99-studio-agent-1a-store.png' })
        await q.getByRole('button', { name: 'Open Kesar test' }).click()
        await q.waitForURL(/\/partner\/studio$/)
        await q.getByText('No requests yet').waitFor()
        await c.close()
      } finally {
        if (paused.length) await db`update partner_links set removed_at = null where tenant_id in ${db(paused.map((r) => r.tenant_id))} and removed_at > now() - interval '10 minutes'`
        await db`delete from members where tenant_id = ${other}`.catch(() => {}); await db`delete from tenants where id = ${other}`.catch(() => {})
      }
    })
    const { ctx, p } = await open({ width: 1280, height: 860 })
    const chat = p.getByRole('complementary', { name: 'Chat' }), insp = p.getByRole('complementary', { name: 'Inspector' })
    const ask = chat.getByRole('textbox', { name: 'Ask for a change' })
    const say = async (words) => { await ask.fill(words); await chat.getByRole('button', { name: 'Send' }).click() }
    const cron = () => fetch(`${CONSOLE}/api/cron/studio`, { headers: { authorization: 'Bearer e2e-cron' } })

    await t.step('state 2: no request yet, the store named', async () => {
      await chat.getByText('No requests yet').waitFor()
      await chat.getByText('Kesar test').waitFor()
      await p.screenshot({ path: 'e2e/.out/99-studio-agent-2-empty.png' })
    })

    await t.step('a request: work lines, a card with the exact colour, Apply through the console’s save', async () => {
      await say('Make the accent warmer')
      await chat.getByText('Make the accent warmer').waitFor()
      const card = chat.getByRole('region', { name: 'Colours for Brand' })
      await until(async () => { if (!(await card.isVisible())) { await cron(); return false } return true }, 30_000)
      await card.getByText('#7A2A1E').waitFor()
      await card.getByText('1 to apply').waitFor()
      await p.screenshot({ path: 'e2e/.out/99-studio-agent-3-card.png' })
      await card.getByRole('button', { name: 'Apply' }).click()
      await card.getByText('Applied').waitFor()
      const [b] = await db`select color_accent, version from brand_tokens where tenant_id = ${S}`
      assert.equal(b.color_accent.toUpperCase(), '#7A2A1E')
      assert.equal(b.version, 1, 'the first save of the record')
      const text = await p.locator('body').innerText()
      assert.doesNotMatch(text, /frs_build_|sk-ant|\$\d|micro/i, 'no key or cost on screen')
    })

    await t.step('state 9: a brand changed since refuses Apply; Reload Brand, then Apply', async () => {
      await say('A new logo please')
      const card = chat.getByRole('region', { name: 'Logo for Brand' })
      await until(async () => { if (!(await card.isVisible())) { await cron(); return false } return true }, 30_000)
      await db`update brand_tokens set version = version + 1 where tenant_id = ${S}`
      await card.getByRole('button', { name: 'Apply' }).click()
      await card.getByText('Not applied').waitFor()
      await card.getByRole('button', { name: 'Reload Brand' }).waitFor()
      await p.screenshot({ path: 'e2e/.out/99-studio-agent-9-refused.png' })
      await card.getByRole('button', { name: 'Reload Brand' }).click()
      await p.waitForLoadState('networkidle')
      await card.getByRole('button', { name: 'Not this' }).click()
      await card.getByText('Not used').waitFor()
    })

    await t.step('states 7 and 8: the store’s own preview; Code and Checks empty', async () => {
      await p.getByText('Store preview').first().waitFor()
      await p.getByText('Drafts included').waitFor()
      assert.equal(await p.locator('iframe[title="Store preview"]').getAttribute('src'), '/console/preview')
      // Framed by the console, same origin only: the store's own page is drawn in the pane (not refused).
      const frame = p.frameLocator('iframe[title="Store preview"]')
      await until(async () => ((await frame.locator('body').innerText().catch(() => '')) ?? '').trim().length > 0, 15_000)
      await insp.getByRole('tab', { name: 'Code' }).click()
      await insp.getByText('No code yet').waitFor()
      await insp.getByRole('tab', { name: 'Checks' }).click()
      await insp.getByText('No checks yet').waitFor()
      await p.screenshot({ path: 'e2e/.out/99-studio-agent-8-empty-tabs.png' })
      await insp.getByRole('tab', { name: 'Design' }).click()
      await insp.getByText('Headings font').waitFor()
    })

    await t.step('state 4: a request at its limit; state 6: a Send refused at today’s limit', async () => {
      await say('Make it expensive with a warmer accent')
      const stop = chat.getByText('This request reached its limit')
      await until(async () => { if (!(await stop.isVisible())) { await cron(); return false } return true }, 40_000)
      await chat.getByRole('button', { name: 'Continue request' }).waitFor()
      await p.screenshot({ path: 'e2e/.out/99-studio-agent-4-limit.png' })
      await db`insert into studio_spend_people (day, user_id, reserved_micro) values (${day}, ${P.id}, 2900000) on conflict (day, user_id) do update set reserved_micro = studio_spend_people.reserved_micro + 2900000`
      try {
        await say('Add a size chart to Product')
        await chat.getByText('Studio reached today’s limit. Ask again from 12:00 am.').waitFor()
        assert.equal(await ask.getAttribute('aria-invalid'), 'true')
        assert.equal(await ask.inputValue(), 'Add a size chart to Product', 'what was typed stays')
        await p.screenshot({ path: 'e2e/.out/99-studio-agent-6-refused.png' })
      } finally { await db`update studio_spend_people set reserved_micro = greatest(0, reserved_micro - 2900000) where day = ${day} and user_id = ${P.id}` }
    })

    await t.step('state 5: a request that failed on Frrata’s side; Try again', async () => {
      await failNext('POST /v1/sessions/sesn_*/events')
      await ask.fill('Tighten spacing')
      await chat.getByRole('button', { name: 'Send' }).click()
      await chat.getByText('We couldn’t finish this request').waitFor()
      await chat.getByText('Nothing was changed.').first().waitFor()
      await chat.getByRole('button', { name: 'Try again' }).waitFor()
      await p.screenshot({ path: 'e2e/.out/99-studio-agent-5-failed.png' })
      assert.deepEqual(await audit(p), [], 'axe at 1280')
    })
    await t.step('state 3: a slow step: what was done, what is running, Stop', async () => {
      // A turn caught mid-run, written as the advance would leave it (the fake answers too fast to see one).
      await db`update studio_sessions set ended_at = now(), end_reason = 'stopped' where tenant_id = ${S} and ended_at is null`
      const [pm] = await db`select partner_member_id as m, (select partner_id from partner_members where id = partner_member_id) as p from members where tenant_id = ${S} and user_id = ${P.id}`
      const [s3] = await db`insert into studio_sessions (tenant_id, partner_id, partner_member_id, user_id) values (${S}, ${pm.p}, ${pm.m}, ${P.id}) returning id`
      const [t3] = await db`insert into studio_turns (tenant_id, partner_id, session_id, started_at, user_message_event_id) values (${S}, ${pm.p}, ${s3.id}, now(), 'sevt_e2e_slow') returning id`
      await db`insert into studio_messages (tenant_id, partner_id, session_id, kind, text) values (${S}, ${pm.p}, ${s3.id}, 'person', 'Make the accent warmer')`
      await db`insert into studio_tool_calls (tenant_id, partner_id, session_id, turn_id, tool_use_id, name, input, created_at, executed_at, result, is_error, answered_at)
        values (${S}, ${pm.p}, ${s3.id}, ${t3.id}, 'sevt_e2e_a', 'store_facts', '{}', now() - interval '2 seconds', now(), '{}', false, now()),
               (${S}, ${pm.p}, ${s3.id}, ${t3.id}, 'sevt_e2e_b', 'tokens_propose', '{}', now() - interval '1 second', null, null, null, null)`
      await p.reload()
      await chat.getByText('Read the brand').waitFor()
      await chat.getByText('Checking the colours').waitFor()
      // As drawn: what was done first, then what is running.
      const lines = await chat.locator('ul li').allInnerTexts()
      assert.ok(lines.findIndex((l) => l.startsWith('Read the brand')) < lines.findIndex((l) => l.startsWith('Checking the colours')), lines.join(' | '))
      await chat.getByText('Working · you can still type').waitFor()
      await chat.getByRole('button', { name: 'Stop' }).waitFor()
      await p.screenshot({ path: 'e2e/.out/99-studio-agent-3-working.png' })
      await chat.getByRole('button', { name: 'Stop' }).click()
      await chat.getByRole('button', { name: 'Send' }).waitFor()
      assert.equal((await db`select end_reason from studio_sessions where id = ${s3.id}`)[0].end_reason, 'stopped')
    })
    await ctx.close()

    await t.step('390: the chat on a phone, axe clean', async () => {
      const { ctx: c2, p: q } = await open({ width: 390, height: 844 })
      await q.getByRole('complementary', { name: 'Chat' }).getByRole('textbox', { name: 'Ask for a change' }).waitFor()
      await q.screenshot({ path: 'e2e/.out/99-studio-agent-phone.png' })
      assert.deepEqual(await audit(q), [], 'axe at 390')
      await c2.close()
    })
  },
}
