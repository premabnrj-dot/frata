// =============================================================================
// FLOW: email (docs/plans/2026-11-11-email.md; ADR-0011). E·0: the sign-in email goes through Supabase's Send Email
// Hook to SES in Frrata's layout; an unsigned hook, an SNS message from another topic and an unsigned one are refused.
// Later phases add notices and order emails to this flow.
// =============================================================================
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { CONSOLE, PORTS, SES } from '../lib.mjs'

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
  },
}
