// Test-only stand-in for Amazon SES v2 and its SNS events (SES_API_BASE in the local end-to-end run; ADR-0011). Never
// deployed. Takes SigV4-signed sends and tenant set-up, records them (/_test/sent), and on /_test/event posts an SES
// event wrapped in an SNS Notification back to the app, signed (SignatureVersion 2) with a key generated at start;
// the matching public key is served at /SimpleNotificationService-e2e.pem (the app trusts it only off Vercel, under
// E2E_FIXTURES, on 127.0.0.1). /_test/fail-next answers the next send with 429.
import http from 'node:http'
import crypto from 'node:crypto'
import { SES } from '../constants.mjs'

const APP = process.env.APP
const PORT = Number(process.env.PORT)
const BASE = `http://127.0.0.1:${PORT}`
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = publicKey.export({ type: 'spki', format: 'pem' })
const sent = [], tenants = [], associations = []
let failNext = 0

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)) }
const read = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString('utf8'))) })
const signedBy = (req) => /^AWS4-HMAC-SHA256 Credential=AKIAE2E\//.test(String(req.headers.authorization ?? ''))

function snsSign(m) {
  const fields = m.Type === 'Notification' ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
  const s = fields.filter((f) => f !== 'Subject' || m.Subject !== undefined).map((f) => `${f}\n${m[f]}\n`).join('')
  return crypto.sign('RSA-SHA256', Buffer.from(s, 'utf8'), privateKey).toString('base64')
}

async function postEvent(sesEvent) {
  const m = { Type: 'Notification', MessageId: crypto.randomUUID(), TopicArn: SES.topic, Message: JSON.stringify(sesEvent), Timestamp: new Date().toISOString(),
    SignatureVersion: '2', SigningCertURL: `${BASE}/SimpleNotificationService-e2e.pem` }
  m.Signature = snsSign(m)
  const r = await fetch(`${APP}/api/webhooks/ses`, { method: 'POST', headers: { 'content-type': 'text/plain; charset=UTF-8', 'x-amz-sns-message-type': 'Notification' }, body: JSON.stringify(m) }).catch(() => null)
  return r?.status ?? 0
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE)
  const body = req.method === 'POST' ? await read(req) : ''
  if (url.pathname === '/SimpleNotificationService-e2e.pem') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end(PEM) }
  if (url.pathname === '/_test/sent') return json(res, 200, sent)
  if (url.pathname === '/_test/tenants') return json(res, 200, { tenants, associations })
  if (url.pathname === '/_test/reset') { sent.length = 0; tenants.length = 0; associations.length = 0; failNext = 0; return json(res, 200, {}) }
  if (url.pathname === '/_test/fail-next') { failNext = Number(url.searchParams.get('n') ?? 1); return json(res, 200, {}) }
  if (url.pathname === '/_test/event') {
    // { messageId (ours) | to, type: Delivery|Bounce|Complaint, bounceType? }
    const q = JSON.parse(body || '{}')
    const s = sent.findLast((x) => (q.messageId ? x.tags.m === q.messageId : x.to === q.to))
    if (!s) return json(res, 404, { error: 'no such send' })
    const mail = { timestamp: s.at, messageId: s.providerId, destination: [s.to], tags: { m: [s.tags.m], t: [s.tags.t] } }
    const at = new Date().toISOString()
    const ev = q.type === 'Bounce' ? { eventType: 'Bounce', mail, bounce: { bounceType: q.bounceType ?? 'Permanent', bounceSubType: 'General', timestamp: at, bouncedRecipients: [{ emailAddress: s.to, diagnosticCode: `smtp; 550 ${s.to} unknown` }] } }
      : q.type === 'Complaint' ? { eventType: 'Complaint', mail, complaint: { timestamp: at, complainedRecipients: [{ emailAddress: s.to }] } }
      : { eventType: 'Delivery', mail, delivery: { timestamp: at, recipients: [s.to], smtpResponse: '250 ok' } }
    return json(res, 200, { status: await postEvent(ev) })
  }
  if (!signedBy(req)) return json(res, 403, { message: 'not signed' })
  if (req.method === 'POST' && url.pathname === '/v2/email/outbound-emails') {
    if (failNext > 0) { failNext--; res.writeHead(429, { 'content-type': 'application/json', 'x-amzn-errortype': 'TooManyRequestsException' }); return res.end('{}') }
    const b = JSON.parse(body)
    const tags = Object.fromEntries((b.EmailTags ?? []).map((t) => [t.Name, t.Value]))
    const providerId = `e2e-${crypto.randomBytes(8).toString('hex')}`
    sent.push({ at: new Date().toISOString(), providerId, from: b.FromEmailAddress, to: b.Destination.ToAddresses[0], replyTo: b.ReplyToAddresses?.[0] ?? null,
      subject: b.Content.Simple.Subject.Data, html: b.Content.Simple.Body.Html.Data, text: b.Content.Simple.Body.Text.Data, headers: b.Content.Simple.Headers ?? [],
      tenant: b.TenantName, configurationSet: b.ConfigurationSetName, tags })
    return json(res, 200, { MessageId: providerId })
  }
  if (req.method === 'POST' && url.pathname === '/v2/email/tenants') { const b = JSON.parse(body); tenants.push(b.TenantName); return json(res, 200, { TenantName: b.TenantName, SendingStatus: 'ENABLED' }) }
  if (req.method === 'POST' && url.pathname === '/v2/email/tenants/resources') { associations.push(JSON.parse(body)); return json(res, 200, {}) }
  json(res, 404, { message: 'unknown' })
}).listen(PORT, '127.0.0.1')
