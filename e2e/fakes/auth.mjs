// Test-only stand-in for Supabase's GET /auth/v1/user. The access token in the
// session cookie names the person (e2e/lib.mjs USERS), so a flow can act as the
// owner or as staff. POST /auth/v1/otp (a sign-in email) is accepted and kept, and
// GET /_test/otp lists the addresses asked for, so a flow can see an email was sent. Never deployed.
import http from 'node:http'
import { USERS } from '../constants.mjs'
const otps = []
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
