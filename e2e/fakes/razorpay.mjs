// Test-only stand-in for Razorpay's API (RAZORPAY_API_BASE in the local end-to-end run). Never deployed.
import http from "node:http"
import crypto from "node:crypto"
import { RZP_KEYS } from '../constants.mjs'
const KEY = RZP_KEYS.id, SECRET = RZP_KEYS.secret
const orders = new Map(), payments = new Map()
const authOk = (req) => req.headers.authorization === 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64')
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
        payments.set(o.id, [...(payments.get(o.id) ?? []), { id, entity: 'payment', status: body.status ?? 'captured', amount: o.amount, currency: 'INR', order_id: o.id, fee: Math.round(o.amount * 0.0236), tax: Math.round(o.amount * 0.0036), method: 'upi' }])
        return send(res, 200, { payment_id: id, signature: crypto.createHmac('sha256', SECRET).update(`${o.id}|${id}`).digest('hex'), payment: payments.get(o.id).at(-1) })
      }
      if (u.pathname === '/_test/orders') return send(res, 200, [...orders.values()])
      return send(res, 404, {})
    }
    if (!authOk(req)) return send(res, 401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } })
    if (req.method === 'GET' && u.pathname === '/v1/payments') return send(res, 200, { entity: 'collection', count: 0, items: [] })
    if (req.method === 'POST' && u.pathname === '/v1/orders') {
      const o = { id: 'order_' + crypto.randomBytes(7).toString('hex'), entity: 'order', amount: body.amount, currency: body.currency, receipt: body.receipt, status: 'created', payment: body.payment }
      orders.set(o.id, o); return send(res, 200, o)
    }
    const m = u.pathname.match(/^\/v1\/orders\/(order_[a-z0-9]+)\/payments$/)
    if (req.method === 'GET' && m) return send(res, 200, { entity: 'collection', items: payments.get(m[1]) ?? [] })
    send(res, 404, { error: 'not found' })
  })
}).listen(Number(process.env.PORT ?? 4010))
