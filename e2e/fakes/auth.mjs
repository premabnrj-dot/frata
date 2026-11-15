// Test-only stand-in for Supabase's GET /auth/v1/user. The access token in the
// session cookie names the person (e2e/lib.mjs USERS), so a flow can act as the
// owner or as staff. POST /auth/v1/otp (a sign-in email) is accepted and kept, and
// GET /_test/otp lists the addresses asked for, so a flow can see an email was sent. Never deployed.
import http from 'node:http'
import { USERS } from '../constants.mjs'
const otps = []
const usedHashes = new Set()
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/auth/v1/otp')) {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy() })
    req.on('end', () => {
      try { otps.push(String(JSON.parse(body).email ?? '').toLowerCase()) } catch { /* not JSON */ }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}')
    })
    return
  }
  // POST /auth/v1/verify with a token hash (the email link, /auth/confirm): `e2e-<who>-<anything>` signs <who> in, once.
  if (req.method === 'POST' && req.url.startsWith('/auth/v1/verify')) {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy() })
    req.on('end', () => {
      let hash = ''
      try { hash = String(JSON.parse(body).token_hash ?? '') } catch { /* not JSON */ }
      const who = /^e2e-([a-z]+)-/.exec(hash)?.[1]
      const u = who && USERS[who]
      if (!u || usedHashes.has(hash)) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' })) }
      usedHashes.add(hash)
      const exp = Math.floor(Date.now() / 1000) + 3600
      const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, who, role: 'authenticated', aud: 'authenticated', exp, session_id: crypto.randomUUID() })}.sig`
      const now = new Date().toISOString()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
        user: { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: now, app_metadata: {}, user_metadata: {}, created_at: now } }))
    })
    return
  }
  if (req.url.startsWith('/_test/otp')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(otps)) }
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  let name = token
  try { name = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).who ?? token } catch { /* a bare name */ }
  const who = USERS[name]
  if (req.url.startsWith('/auth/v1/user') && who) {
    const now = new Date().toISOString()
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ id: who.id, email: who.email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: now, app_metadata: {}, user_metadata: {}, created_at: now }))
  }
  res.writeHead(req.url.startsWith('/auth/v1/user') ? 401 : 404, { 'content-type': 'application/json' }); res.end('{}')
}).listen(Number(process.env.PORT ?? 54321))
