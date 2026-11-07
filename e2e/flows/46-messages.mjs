// =============================================================================
// FLOW: messages — C1 Connect (docs/specs/2026-11-07-communication.md § C1): turn Messages on in Apps,
// connect a WhatsApp Business app number through Meta's popup (a stand-in SDK and Graph API), see its
// health in words, receive Meta's webhooks (signed, forged, unknown number), disconnect, connect a new number.
// Guards: ids taken from the browser, a Business app number registered with a PIN, a token kept after a
// disconnect, a forged webhook stored, an item for no shop stored, Meta's raw words on the page.
// =============================================================================
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { CONSOLE, META, PORTS, USERS, signedIn, until } from '../lib.mjs'

const KESAR = 'd7342b03-4f9e-45db-b5e0-3760967cb3c7'
const GRAPH = `http://localhost:${PORTS.meta}`
const sign = (raw, secret = META.appSecret) => 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
const hook = (body, secret) => { const raw = JSON.stringify(body); return fetch(CONSOLE + '/api/webhooks/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw, secret) }, body: raw }) }
const calls = async () => (await (await fetch(GRAPH + '/_test/calls')).json())
// Meta's SDK, as the page uses it: login answers with a signup code; the popup's message carries a FORGED id
// (another shop's account) that the server must ignore. postMessage from the page has the page's origin, which
// the page refuses anyway: the server reads the ids from the token.
const FAKE_SDK = (code) => `window.FB = { init() {}, login(cb, o) { window.__fbOpts = o; setTimeout(() => cb({ authResponse: { code: '${code}' } }), 50) } }; window.fbAsyncInit && window.fbAsyncInit();`

export default {
  name: 'messages',
  async run(t) {
    const { db } = t
    const open = async (who, opts) => { const ctx = await signedIn(t.browser, who, opts); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('     console:', m.text().slice(0, 200)) }); return p }
    const riya = await open('owner')
    let sdkCode = 'code-app-0001'
    await riya.route('https://connect.facebook.net/**', (r) => r.fulfill({ contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_SDK(sdkCode) }))

    await t.step('Apps: turn Messages on; Set up appears', async () => {
      await riya.goto(CONSOLE + '/console/apps')
      const sw = riya.getByRole('switch', { name: 'Messages' })
      await sw.click()
      await riya.getByRole('link', { name: 'Set up' }).waitFor()
      const [m] = await db`select module from tenant_modules where tenant_id = ${KESAR} and disabled_at is null`
      assert.equal(m.module, 'communication')
      await riya.screenshot({ path: t.out('apps-on') })
    })

    await t.step('Connect: two paths, a phone that does not scroll sideways', async () => {
      await riya.getByRole('link', { name: 'Set up' }).click()
      await riya.getByRole('heading', { level: 1, name: 'Connect WhatsApp' }).waitFor()
      await riya.getByRole('button', { name: /I use the WhatsApp Business app/ }).waitFor()
      await riya.getByRole('button', { name: /A new number/ }).waitFor()
      await riya.screenshot({ path: t.out('connect'), fullPage: true })
      const q = await open('owner', { viewport: { width: 390, height: 844 } })
      await q.goto(CONSOLE + '/console/apps/communication')
      await q.getByRole('heading', { level: 1, name: 'Connect WhatsApp' }).waitFor()
      assert.ok(await q.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll on a phone')
      await q.screenshot({ path: t.out('connect-phone'), fullPage: true })
    })

    await t.step('Business app number: connected, never registered, history asked for, token sealed', async () => {
      await riya.getByRole('button', { name: /I use the WhatsApp Business app/ }).click()
      await riya.getByRole('heading', { level: 1, name: 'Messages' }).waitFor()
      await riya.getByText('+91 98450 12345').first().waitFor()
      await riya.getByText('WhatsApp Business app and Frrata', { exact: false }).waitFor()
      const opts = await riya.evaluate(() => window.__fbOpts)
      assert.equal(opts.extras.featureType, 'whatsapp_business_app_onboarding'); assert.equal(opts.config_id, META.configId)
      const [c] = await db`select waba_id, phone_number_id, coexistence, token_enc, currency, history_sync_at from wa_connections where tenant_id = ${KESAR} and disconnected_at is null`
      assert.equal(c.waba_id, '100000000001'); assert.equal(c.phone_number_id, '200000000001'); assert.equal(c.coexistence, true)
      assert.ok(c.token_enc.startsWith('v1.') && !c.token_enc.includes('EAA'), 'the token is sealed'); assert.ok(c.history_sync_at)
      const log = await calls()
      assert.equal(log.filter((x) => x.path.endsWith('/register')).length, 0, 'a Business app number is never registered')
      assert.deepEqual(log.filter((x) => x.path.endsWith('/smb_app_data')).map((x) => x.body.sync_type), ['smb_app_state_sync', 'history'])
      assert.ok(log.some((x) => x.method === 'POST' && x.path.endsWith('/100000000001/subscribed_apps')))
      // Billing in USD: the INR deadline is a need, in words; Meta's raw values never show.
      await riya.getByText('Move WhatsApp billing to INR').waitFor()
      await riya.getByText('Needs attention').first().waitFor()
      assert.equal(await riya.getByText(/TIER_|GREEN|CLOUD_API/).count(), 0)
      await riya.screenshot({ path: t.out('health'), fullPage: true })
    })

    await t.step('Webhooks: verify, forged refused, unknown number not stored, items one row each', async () => {
      const ok = await fetch(CONSOLE + `/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${META.verifyToken}&hub.challenge=12345`)
      assert.equal(ok.status, 200); assert.equal(await ok.text(), '12345')
      assert.equal((await fetch(CONSOLE + '/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')).status, 403)
      const msg = (pnid, wamid) => ({ object: 'whatsapp_business_account', entry: [{ id: '100000000001', changes: [{ field: 'messages', value: { metadata: { phone_number_id: pnid }, messages: [{ id: wamid, from: '919999999999', type: 'text', text: { body: 'hi' } }], statuses: [{ id: 'wamid.S1abcdef', status: 'delivered' }, { id: 'wamid.S1abcdef', status: 'read' }] } }] }] })
      assert.equal((await hook(msg('200000000001', 'wamid.F0rged00'), 'not-the-secret')).status, 401)
      assert.equal((await hook(msg('200000000001', 'wamid.M1abcdef'))).status, 200)
      assert.equal((await hook(msg('200000000001', 'wamid.M1abcdef'))).status, 200) // Meta's retry
      assert.equal((await hook(msg('299999999999', 'wamid.N0shop00'))).status, 200)
      const rows = await until(async () => { const r = await db`select event_key, payload, processed_at from webhook_events where provider = 'whatsapp' order by event_key`; return r.length === 3 && r.every((x) => x.processed_at) ? r : null })
      assert.deepEqual(rows.map((r) => r.event_key), [
        `whatsapp:${KESAR}:200000000001:message:wamid.M1abcdef`, `whatsapp:${KESAR}:200000000001:status:wamid.S1abcdef:delivered`, `whatsapp:${KESAR}:200000000001:status:wamid.S1abcdef:read`])
      assert.ok(rows.every((r) => !JSON.stringify(r.payload).includes('919999999999')), 'no shopper data kept before C2')
      assert.equal((await db`select count(*)::int n from webhook_events where event_key like '%wamid.F0rged00%' or event_key like '%299999999999%'`)[0].n, 0)
    })

    await t.step('A quality change from Meta reaches the page in words', async () => {
      await fetch(GRAPH + '/_test/set', { method: 'POST', body: JSON.stringify({ quality: 'RED' }) })
      await hook({ object: 'whatsapp_business_account', entry: [{ id: '100000000001', changes: [{ field: 'phone_number_quality_update', value: { display_phone_number: '919845012345', event: 'DOWNGRADE' } }] }] })
      await until(async () => (await db`select quality from wa_connections where tenant_id = ${KESAR} and disconnected_at is null`)[0]?.quality === 'RED')
      await riya.reload()
      await riya.getByText('Quality low').waitFor()
      await riya.getByText('Low', { exact: true }).waitFor()
    })

    await t.step('Disconnect: the token is deleted, Meta unsubscribed, the connect page is back', async () => {
      await riya.getByRole('button', { name: 'More' }).click()
      await riya.getByRole('menuitem', { name: 'Disconnect' }).click()
      const d = riya.getByRole('dialog', { name: /Disconnect \+91 98450 12345/ })
      await d.getByRole('button', { name: 'Disconnect' }).click()
      await riya.getByRole('heading', { level: 1, name: 'Connect WhatsApp' }).waitFor()
      const [c] = await db`select token_enc, disconnected_at from wa_connections where tenant_id = ${KESAR} order by connected_at desc limit 1`
      assert.equal(c.token_enc, null); assert.ok(c.disconnected_at)
      assert.ok((await calls()).some((x) => x.method === 'DELETE' && x.path.endsWith('/100000000001/subscribed_apps')))
      // A webhook for the closed number now stores nothing.
      await hook({ object: 'whatsapp_business_account', entry: [{ id: '100000000001', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '200000000001' }, messages: [{ id: 'wamid.After001' }] } }] }] })
      assert.equal((await db`select count(*)::int n from webhook_events where event_key like '%wamid.After001%'`)[0].n, 0)
    })

    await t.step('A new number: registered with a 6-digit PIN; its name in review, in words', async () => {
      sdkCode = 'code-new-0001'
      await fetch(GRAPH + '/_test/set', { method: 'POST', body: JSON.stringify({ quality: 'GREEN', currency: 'INR' }) })
      await riya.reload()
      await riya.getByRole('button', { name: /A new number/ }).click()
      await riya.getByText('+91 90000 22222').first().waitFor()
      await riya.getByText('Display name "Kesar Studio"').waitFor()
      const reg = (await calls()).filter((x) => x.path.endsWith('/200000000002/register'))
      assert.equal(reg.length, 1); assert.match(reg[0].body.pin, /^\d{6}$/)
      const [c] = await db`select coexistence from wa_connections where tenant_id = ${KESAR} and disconnected_at is null`
      assert.equal(c.coexistence, false)
      assert.equal((await db`select count(*)::int n from audit_events where tenant_id = ${KESAR} and action like 'messages.%'`)[0].n, 3)
    })

    await t.step('Staff see the number, not the controls', async () => {
      const S = USERS.staff
      await db`insert into auth.users (id, email, email_confirmed_at) values (${S.id}, ${S.email}, now()) on conflict (id) do nothing`
      await db`insert into members (tenant_id, user_id, role) values (${KESAR}, ${S.id}, 'staff') on conflict do nothing`
      const arjun = await open('staff')
      await arjun.goto(CONSOLE + '/console/apps/communication')
      await arjun.getByText('+91 90000 22222').first().waitFor()
      assert.equal(await arjun.getByRole('button', { name: 'More' }).count(), 0)
      await db`delete from members where tenant_id = ${KESAR} and user_id = ${S.id}`
    })
  },
}
