// Test-only stand-in for Razorpay's API (RAZORPAY_API_BASE in the local end-to-end run). Never deployed.
import http from "node:http"
import crypto from "node:crypto"
import { BILLING_KEYS, RZP_KEYS } from '../constants.mjs'
const KEY = RZP_KEYS.id, SECRET = RZP_KEYS.secret
const orders = new Map(), payments = new Map(), byId = new Map()
let failNext = false
const basic = (id, secret) => 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
// A shop's keys (checkout) or Frrata's billing keys (billing B3): each signs with its own secret.
const authOk = (req) => req.headers.authorization === basic(KEY, SECRET) || req.headers.authorization === basic(BILLING_KEYS.id, BILLING_KEYS.secret)
const billing = (req) => req.headers.authorization === basic(BILLING_KEYS.id, BILLING_KEYS.secret)
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }); res.end(JSON.stringify(body)) }
http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); const body = raw ? JSON.parse(raw) : {}
    if (req.method === 'OPTIONS') return send(res, 204, {})
    if (u.pathname.startsWith('/_test/')) {
      // The fake checkout.js asks here to "pay": a captured payment, signed as Razorpay would.
      if (u.pathname === '/_test/pay') {
        const o = orders.get(body.order_id); if (!o) return send(res, 404, {})
        const id = 'pay_' + crypto.randomBytes(7).toString('hex')
        const p = { id, entity: 'payment', status: body.status ?? 'captured', amount: o.amount, currency: 'INR', order_id: o.id, fee: Math.round(o.amount * 0.0236), tax: Math.round(o.amount * 0.0036), method: o.method ?? 'upi',
          ...(o.token ? { token_id: 'token_' + crypto.randomBytes(7).toString('hex'), customer_id: o.customer_id } : {}) }
        payments.set(o.id, [...(payments.get(o.id) ?? []), p]); byId.set(id, p)
        // Signed with the key of the account that made the order (a shop's, or Frrata's billing account).
        return send(res, 200, { payment_id: id, signature: crypto.createHmac('sha256', o.billing ? BILLING_KEYS.secret : SECRET).update(`${o.id}|${id}`).digest('hex'), payment: p })
      }
      if (u.pathname === '/_test/orders') return send(res, 200, [...orders.values()])
      if (u.pathname === '/_test/fail-next') { failNext = true; return send(res, 200, {}) }
      if (u.pathname === '/_test/payments') return send(res, 200, [...byId.values()])
      return send(res, 404, {})
    }
    if (!authOk(req)) return send(res, 401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } })
    if (req.method === 'GET' && u.pathname === '/v1/payments') return send(res, 200, { entity: 'collection', count: 0, items: [] })
    if (req.method === 'POST' && u.pathname === '/v1/orders') {
      const o = { id: 'order_' + crypto.randomBytes(7).toString('hex'), entity: 'order', amount: body.amount, currency: body.currency, receipt: body.receipt, status: 'created', payment: body.payment,
        customer_id: body.customer_id, method: body.method, token: body.token, billing: billing(req) }
      orders.set(o.id, o); return send(res, 200, o)
    }
    if (req.method === 'GET' && u.pathname === '/v1/orders') return send(res, 200, { entity: 'collection', items: [...orders.values()].filter((o) => o.receipt === u.searchParams.get('receipt')) })
    if (req.method === 'POST' && u.pathname === '/v1/customers') return send(res, 200, { id: 'cust_' + crypto.createHash('sha256').update(String(body.email)).digest('hex').slice(0, 14), entity: 'customer' })
    const pm = u.pathname.match(/^\/v1\/payments\/(pay_[a-z0-9]+)$/)
    if (req.method === 'GET' && pm) return byId.has(pm[1]) ? send(res, 200, byId.get(pm[1])) : send(res, 404, { error: { description: 'no such payment' } })
    // A recurring debit on a token: captured, or failed once after /_test/fail-next.
    if (req.method === 'POST' && u.pathname === '/v1/payments/create/recurring') {
      const o = orders.get(body.order_id); if (!o || !body.token) return send(res, 400, { error: { description: 'bad recurring request' } })
      const id = 'pay_' + crypto.randomBytes(7).toString('hex')
      const p = { id, entity: 'payment', status: failNext ? 'failed' : 'captured', amount: body.amount, currency: 'INR', order_id: o.id, method: 'upi', ...(failNext ? { error_description: 'The bank declined the debit' } : {}) }
      failNext = false
      payments.set(o.id, [...(payments.get(o.id) ?? []), p]); byId.set(id, p)
      return send(res, 200, { razorpay_payment_id: id, razorpay_order_id: o.id })
    }
    const m = u.pathname.match(/^\/v1\/orders\/(order_[a-z0-9]+)\/payments$/)
    if (req.method === 'GET' && m) return send(res, 200, { entity: 'collection', items: payments.get(m[1]) ?? [] })
    send(res, 404, { error: 'not found' })
  })
}).listen(Number(process.env.PORT ?? 4010))
