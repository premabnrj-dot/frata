// =============================================================================
// FLOW: email (docs/plans/2026-11-11-email.md; ADR-0011). E·0: the sign-in email goes through Supabase's Send Email
// Hook to SES in Frrata's layout; an unsigned hook, an SNS message from another topic and an unsigned one are refused.
// E·1: Admin writes to one shop → the owner's Notices count, the list, read on open, and the email after the drain.
// E·2: a COD order with an email → "Order … is confirmed" from the shop; the order page's Emails card; a bounce stops
// the address for this shop; a switched-off email is skipped with its reason; "Email me new drops" is saved on the tap.
// =============================================================================
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { CONSOLE, PORTS, SES, SHOP, USERS, signedIn, until } from '../lib.mjs'

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

    await t.step('order emails: confirmed from the shop, the Emails card, a bounce stops the address, off is skipped, drops on the tap', async () => {
      const { db } = t
      const [shop] = await db`select id from tenants where slug = 'kesar-studio'`
      // The shop's SES tenant is set up ahead in production (its own paced row); here it is already there.
      await db`insert into email_shops (tenant_id, ses_ready_at) values (${shop.id}, now()) on conflict (tenant_id) do update set ses_ready_at = now()`
      await db`update variants set stock = 50 where tenant_id = ${shop.id} and archived_at is null` // two orders below, whatever the seed left
      const drain = () => fetch(`${CONSOLE}/api/cron/drain`, { headers: { authorization: 'Bearer e2e-cron' } })
      const ctx = await t.browser.newContext({ viewport: { width: 390, height: 844 } })
      const p = await ctx.newPage(); p.setDefaultTimeout(15_000); p.on('pageerror', (e) => t.errors.push(e.message))
      const order = async (email) => {
        await p.goto(SHOP + '/products/chanderi-kurta-set', { waitUntil: 'domcontentloaded' })
        await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() }); await p.reload({ waitUntil: 'domcontentloaded' })
        await p.getByRole('button', { name: /^Rust/ }).click(); await p.getByRole('button', { name: 'M', exact: true }).click()
        await p.getByRole('button', { name: /Add to bag|Pre-order/ }).click(); await p.getByRole('dialog', { name: 'Your bag' }).waitFor()
        await p.getByRole('button', { name: 'Checkout' }).click(); await p.waitForURL(/\/checkout$/)
        await p.fill('#phone', '98290 43219'); await p.fill('#name', 'Meera Joshi'); await p.fill('#email', email)
        await p.fill('#pincode', '302001'); await p.fill('#city', 'Jaipur')
        await p.fill('#addressLine', 'B-14, Tilak Marg'); await p.fill('#area', 'C-Scheme'); await p.selectOption('#state', 'Rajasthan')
        await p.getByText('Pay on delivery', { exact: true }).click()
        await p.getByRole('button', { name: /Place order/ }).click(); await p.waitForURL(/\/orders#t=/)
        const [o] = await db`select id, number from orders where tenant_id = ${shop.id} order by placed_at desc limit 1`
        return o
      }
      try {
        const o = await order('meera.joshi@example.in')
        await p.getByText('me•••@example.in').waitFor() // the shopper's page says where updates go, masked
        await drain()
        const mail = await until(async () => (await sent()).find((m) => m.to === 'meera.joshi@example.in'), 10_000)
        assert.match(mail.subject, /^Order KS-\d+ is confirmed$/)
        assert.match(mail.from, /^"?Kesar Studio"? <kesar-studio@/)
        assert.equal(mail.replyTo, 'riya@kesarstudio.in', 'replies go to the shop')
        assert.equal(mail.tenant, `t-${shop.id}`)
        const drops = mail.text.match(/Email me new drops: (\S+)/)?.[1]
        assert.ok(drops, 'the footer offers new drops')
        assert.match(drops, /\/email\/drops#o=/, 'its token is in the #fragment, never a log')
        const orderLink = mail.text.match(/(http\S+\/orders#o=\S+)/)?.[1]
        assert.ok(orderLink, 'the button opens the order through a link bound to this address')
        await p.goto(orderLink); await p.getByText('me•••@example.in').waitFor()

        // "Email me new drops": opening the link saves nothing; the tap does.
        await p.goto(drops)
        assert.equal((await db`select count(*)::int n from customer_consents where tenant_id = ${shop.id} and purpose = 'marketing_email'`)[0].n, 0, 'a GET consents to nothing')
        await p.getByRole('button', { name: 'Email me new drops' }).click()
        await p.getByText(/You’ll get an email when something new arrives/).waitFor()
        assert.equal((await db`select count(*)::int n from customer_consents where tenant_id = ${shop.id} and purpose = 'marketing_email' and withdrawn_at is null`)[0].n, 1)

        // A permanent bounce: the card says so, and the address is stopped for this shop.
        assert.equal((await (await fetch(`${FAKE}/_test/event`, { method: 'POST', body: JSON.stringify({ messageId: mail.tags.m, type: 'Bounce' }) })).json()).status, 200)
        await until(async () => (await db`select count(*)::int n from email_suppressions where tenant_id = ${shop.id} and lifted_at is null`)[0].n === 1, 10_000)
        const owner = await signedIn(t.browser, 'owner', { viewport: { width: 1280, height: 860 } })
        try {
          const c = await owner.newPage(); c.setDefaultTimeout(15_000); c.on('pageerror', (e) => t.errors.push(e.message))
          await c.goto(CONSOLE + `/console/orders/${o.number}`)
          const card = c.locator('#emails')
          await card.getByText('Bounced: no such address').waitFor()
          await c.screenshot({ path: t.out('order-emails'), fullPage: true })
          // Switch Order confirmed off in Settings › Emails: the next order's email is skipped, with its reason, and the
          // shop's own words stay (the switch changes the switch only; impact review E·2).
          await db`insert into shop_emails (tenant_id, kind, subject) values (${shop.id}, 'confirmed', 'Your Kesar order [Order number]')
            on conflict (tenant_id, kind) do update set subject = excluded.subject`
          await c.goto(CONSOLE + '/console/settings/emails')
          await c.getByRole('switch', { name: /Order confirmed/ }).click()
          await until(async () => (await db`select off_at from shop_emails where tenant_id = ${shop.id} and kind = 'confirmed'`)[0]?.off_at, 10_000)
          assert.equal((await db`select subject from shop_emails where tenant_id = ${shop.id} and kind = 'confirmed'`)[0].subject, 'Your Kesar order [Order number]', 'the words survive the switch')
          const o2 = await order('meera.j@example.in')
          await drain()
          await until(async () => (await db`select skip_code from email_messages where tenant_id = ${shop.id} and order_id = ${o2.id} and kind = 'confirmed'`)[0]?.skip_code === 'off', 10_000)
          await c.goto(CONSOLE + `/console/orders/${o2.number}`)
          await c.locator('#emails').getByText('Not sent: switched off in Settings').waitFor()
          assert.ok(!(await sent()).some((m) => m.to === 'meera.j@example.in'), 'nothing was sent')
        } finally { await owner.close() }
      } finally { await ctx.close() }
    })
  },
}
