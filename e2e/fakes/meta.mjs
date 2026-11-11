// Test-only stand-in for Meta's Graph API (META_GRAPH_BASE in the local end-to-end run). Never deployed.
// Two signup codes: "code-app-…" gives a Business app number (coexistence), "code-new-…" a new number.
// Every call is recorded for the flow to read at /_test/calls.
import http from 'node:http'
import { EKCODE, META } from '../constants.mjs'

const V = '/v26.0'
const tokens = new Map() // token → { waba, number, app }
const calls = []
const NUMBERS = {
  app: { id: '200000000001', display_phone_number: '+91 98450 12345', verified_name: 'Kesar Studio', quality_rating: 'GREEN', name_status: 'APPROVED',
    whatsapp_business_manager_messaging_limit: 'TIER_250', is_on_biz_app: true, platform_type: 'CLOUD_API', health_status: { can_send_message: 'AVAILABLE' } },
  new: { id: '200000000002', display_phone_number: '+91 90000 22222', verified_name: 'Kesar Studio', quality_rating: 'GREEN', name_status: 'PENDING_REVIEW',
    whatsapp_business_manager_messaging_limit: 'TIER_250', is_on_biz_app: false, platform_type: 'CLOUD_API', health_status: { can_send_message: 'AVAILABLE' } },
}
let quality = 'GREEN', currency = 'USD', rejectAll = false
// Frrata's own number (trials TR1 sign-up codes): the token, and the last code sent to each number.
const FRRATA_TOKEN = 'EAAe2efrratasignup', FRRATA_NUMBER = '200000000099'
const sentCodes = new Map()
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
const bearer = (req) => (req.headers.authorization ?? '').replace(/^Bearer /, '')

http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); const body = raw ? JSON.parse(raw) : {}
    if (u.pathname.startsWith('/_test/')) {
      if (u.pathname === '/_test/calls') return send(res, 200, calls)
      if (u.pathname === '/_test/code') return send(res, 200, { code: sentCodes.get(u.searchParams.get('to') ?? '') ?? null })
      if (u.pathname === '/_test/set') { quality = body.quality ?? quality; currency = body.currency ?? currency; rejectAll = body.rejectAll ?? rejectAll; return send(res, 200, { ok: true }) }
      return send(res, 404, {})
    }
    calls.push({ method: req.method, path: u.pathname, body })
    const p = u.pathname.startsWith(V) ? u.pathname.slice(V.length) : null
    if (!p) return send(res, 404, { error: { message: 'unknown version' } })
    if (p === '/oauth/access_token') {
      if (u.searchParams.get('client_secret') !== META.appSecret || u.searchParams.get('client_id') !== META.appId) return send(res, 400, { error: { code: 1 } })
      const code = u.searchParams.get('code') ?? ''
      const kind = code.startsWith('code-app-') ? 'app' : code.startsWith('code-new-') ? 'new' : null
      if (!kind) return send(res, 400, { error: { code: 100, message: 'bad code' } })
      const token = `EAAe2e${kind}${Math.random().toString(36).slice(2)}xxxxxxxxxxxx`
      tokens.set(token, { waba: kind === 'app' ? '100000000001' : '100000000002', kind })
      return send(res, 200, { access_token: token, token_type: 'bearer' })
    }
    if (p === '/debug_token') {
      if (bearer(req) !== `${META.appId}|${META.appSecret}`) return send(res, 401, { error: { code: 190 } })
      const t = tokens.get(u.searchParams.get('input_token') ?? '')
      if (!t) return send(res, 200, { data: { is_valid: false } })
      return send(res, 200, { data: { app_id: META.appId, is_valid: true, granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: [t.waba] }, { scope: 'whatsapp_business_messaging', target_ids: [t.waba] }] } })
    }
    // EkCode's own number (P1): copy-code sends; a number not on WhatsApp answers 131026 at once.
    if (bearer(req) === EKCODE.token) {
      let n
      if (req.method === 'POST' && (n = p.match(/^\/(\d+)\/messages$/)) && n[1] === EKCODE.number && body.type === 'template' && body.template?.name === EKCODE.template) {
        if (body.to === `91${EKCODE.notOnWhatsApp}`) return send(res, 400, { error: { code: 131026, message: 'Message undeliverable' } })
        sentCodes.set(body.to, body.template.components?.[0]?.parameters?.[0]?.text ?? null)
        return send(res, 200, { messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: `wamid.ek${Date.now()}${Math.random().toString(36).slice(2, 6)}` }] })
      }
      return send(res, 400, { error: { code: 100 } })
    }
    if (bearer(req) === FRRATA_TOKEN) {
      let n
      if (req.method === 'POST' && (n = p.match(/^\/(\d+)\/messages$/)) && n[1] === FRRATA_NUMBER && body.type === 'template' && body.template?.name === 'frrata_signup_code') {
        sentCodes.set(body.to, body.template.components?.[0]?.parameters?.[0]?.text ?? null)
        return send(res, 200, { messaging_product: 'whatsapp', contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id: `wamid.${Date.now()}` }] })
      }
      return send(res, 400, { error: { code: 100 } })
    }
    const t = tokens.get(bearer(req))
    if (!t || rejectAll) return send(res, 401, { error: { code: 190, message: 'Error validating access token' } })
    let m
    if (req.method === 'GET' && (m = p.match(/^\/(\d+)\/phone_numbers$/))) {
      if (m[1] !== t.waba) return send(res, 403, { error: { code: 200 } })
      return send(res, 200, { data: [{ ...NUMBERS[t.kind], quality_rating: quality }] })
    }
    if ((m = p.match(/^\/(\d+)\/subscribed_apps$/))) return m[1] === t.waba ? send(res, 200, { success: true }) : send(res, 403, { error: { code: 200 } })
    if (req.method === 'GET' && (m = p.match(/^\/(\d+)$/))) {
      if (m[1] !== t.waba) return send(res, 403, { error: { code: 200 } })
      return send(res, 200, { id: t.waba, currency, owner_business_info: { id: '300000000001', name: 'Kesar Studio' } })
    }
    if (req.method === 'POST' && (m = p.match(/^\/(\d+)\/register$/))) {
      // A Business app number must never be registered (Meta, checked 2026-11-07).
      if (NUMBERS.app.id === m[1]) return send(res, 400, { error: { code: 100, message: 'already registered with the Business app' } })
      return /^\d{6}$/.test(body.pin ?? '') ? send(res, 200, { success: true }) : send(res, 400, { error: { code: 100 } })
    }
    if (req.method === 'POST' && (m = p.match(/^\/(\d+)\/smb_app_data$/))) return send(res, 200, { request_id: `req_${body.sync_type}` })
    send(res, 404, { error: { message: 'not found' } })
  })
}).listen(Number(process.env.PORT ?? 4020))
