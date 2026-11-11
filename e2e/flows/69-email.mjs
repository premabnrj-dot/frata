// =============================================================================
// FLOW: email (docs/plans/2026-11-11-email.md; ADR-0011). E·0: the sign-in email goes through Supabase's Send Email
// Hook to SES in Frrata's layout; an unsigned hook, an SNS message from another topic and an unsigned one are refused.
// E·1: Admin writes to one shop → the owner's Notices count, the list, read on open, and the email after the drain.
// Later phases add order emails to this flow.
// =============================================================================
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { CONSOLE, PORTS, SES, USERS, signedIn } from '../lib.mjs'

const FAKE = `http://127.0.0.1:${PORTS.ses}`
const sent = async () => (await (await fetch(`${FAKE}/_test/sent`)).json())
const hook = (body, sign = true) => {
  const id = `msg_${crypto.randomUUID()}`, ts = String(Math.floor(Date.now() / 1000))
  const key = Buffer.from(SES.hookSecret.replace(/^v1,whsec_/, ''), 'base64')
  const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return fetch(`${CONSOLE}/api/auth/send-email`, { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sign ? `v1,${sig}` : 'v1,AAAA' }, body })
}

export default {
  name: 'email',
  async run(t) {
    await fetch(`${FAKE}/_test/reset`)

    await t.step('sign-in email through the Send Email Hook: Frrata\'s layout, the code and a link, from the notices sender', async () => {
      const body = JSON.stringify({ user: { email: 'riya@kesarstudio.in' }, email_data: { token: '123456', token_hash: 'pkce_abc', redirect_to: `${CONSOLE}/auth/callback`, email_action_type: 'magiclink', site_url: 'https://proj.supabase.co/auth/v1' } })
      const r = await hook(body)
      assert.equal(r.status, 200, 'the hook answered 200')
      const [m] = await sent()
      assert.equal(m.to, 'riya@kesarstudio.in')
      assert.equal(m.from, SES.noticesFrom)
      assert.match(m.subject, /^123456 is your Frrata sign-in code$/)
      assert.match(m.html, /frrata/)
      assert.match(m.text, /https:\/\/proj\.supabase\.co\/auth\/v1\/verify\?token=pkce_abc&type=magiclink/)
      assert.equal(m.tenant, 'frrata')
    })

    await t.step('refused: an unsigned hook, an SNS message from another topic or unsigned', async () => {
      assert.equal((await hook('{}', false)).status, 401)
      const msg = { Type: 'Notification', MessageId: 'x', TopicArn: 'arn:aws:sns:ap-south-1:999999999999:theirs', Message: '{}', Timestamp: new Date().toISOString(), SignatureVersion: '2', Signature: 'AA', SigningCertURL: `${FAKE}/SimpleNotificationService-e2e.pem` }
      const post = (m) => fetch(`${CONSOLE}/api/webhooks/ses`, { method: 'POST', headers: { 'x-amz-sns-message-type': 'Notification' }, body: JSON.stringify(m) })
      assert.equal((await post(msg)).status, 403, 'another topic')
      assert.equal((await post({ ...msg, TopicArn: SES.topic })).status, 403, 'a bad signature')
      assert.equal((await sent()).length, 1, 'nothing more was sent')
    })

    await t.step('Admin writes to one shop: a required notice in the console and by email; opening Notices reads it', async () => {
      const { db } = t
      const F = USERS.frata
      await db`insert into auth.users (id, email, email_confirmed_at) values (${F.id}, ${F.email}, now()) on conflict (id) do nothing`
      await db`insert into platform_staff (user_id, email, role) values (${F.id}, ${F.email}, 'admin') on conflict (user_id) do update set role = 'admin'`
      const [shop] = await db`select id from tenants where slug = 'kesar-studio'`
      const open = async (who) => { const ctx = await signedIn(t.browser, who, { viewport: { width: 1280, height: 860 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message)); return { ctx, p } }
      const admin = await open('frata')
      try {
        await admin.p.goto(CONSOLE + '/admin/notices')
        await admin.p.getByLabel('To').selectOption('shop')
        await admin.p.getByLabel('Shop id').fill(shop.id)
        await admin.p.getByLabel('Kind').selectOption('security')
        await admin.p.getByLabel('Title').fill('We changed how support visits work')
        await admin.p.getByLabel('Required (billing, security, Frrata acted)').check()
        await admin.p.getByRole('button', { name: 'Send' }).click()
        await admin.p.getByText('Sent to 1 shop.').waitFor()
        await admin.p.getByRole('cell', { name: 'We changed how support visits work' }).waitFor()
      } finally { await admin.ctx.close() }
      const owner = await open('owner')
      try {
        await owner.p.goto(CONSOLE + '/console')
        const nav = owner.p.getByRole('navigation', { name: 'Console', exact: true })
        const bell = nav.getByRole('link', { name: /^Notices/ })
        await bell.filter({ hasText: /1/ }).waitFor() // the unread pill streams in after the shell
        await owner.p.screenshot({ path: t.out('console-bell') })
        await nav.getByRole('link', { name: /Notices/ }).click()
        await owner.p.getByText('We changed how support visits work').waitFor()
        await owner.p.screenshot({ path: t.out('notices'), fullPage: true })
        // Opening the list marks it read (an action after render): back on Home, no pill.
        await owner.p.waitForTimeout(800)
        await owner.p.goto(CONSOLE + '/console')
        await owner.p.waitForTimeout(800)
        assert.equal((await bell.innerText()).trim(), 'Notices', 'no unread pill once read')
      } finally { await owner.ctx.close() }
      // The required notice's email goes at once: the 5-minute drain sends it.
      const r = await fetch(`${CONSOLE}/api/cron/drain`, { headers: { authorization: 'Bearer e2e-cron' } })
      assert.equal(r.status, 200)
      const mail = (await sent()).find((m) => m.subject === 'We changed how support visits work')
      assert.ok(mail, 'the notice was emailed')
      assert.equal(mail.to, USERS.owner.email)
      assert.equal(mail.tenant, 'frrata')
      const [row] = await db`select sent_at, provider_id from email_messages where kind = 'notice' order by created_at desc limit 1`
      assert.ok(row.sent_at && row.provider_id, 'the attempt row is marked sent')
    })
  },
}
