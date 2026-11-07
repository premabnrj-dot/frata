// Test-only stand-in for Supabase's GET /auth/v1/user. The access token in the
// session cookie names the person (e2e/lib.mjs USERS), so a flow can act as the
// owner or as staff. Never deployed.
import http from 'node:http'
import { USERS } from '../constants.mjs'
http.createServer((req, res) => {
  const who = USERS[(req.headers.authorization ?? '').replace(/^Bearer /, '')]
  if (req.url.startsWith('/auth/v1/user') && who) {
    const now = new Date().toISOString()
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ id: who.id, email: who.email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: now, app_metadata: {}, user_metadata: {}, created_at: now }))
  }
  res.writeHead(req.url.startsWith('/auth/v1/user') ? 401 : 404, { 'content-type': 'application/json' }); res.end('{}')
}).listen(Number(process.env.PORT ?? 54321))
