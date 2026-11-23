// tools/echo — a throwaway page for Studio's R8 probe (docs/plans/2026-11-22-v3a-runtime.md, security M1). It answers
// GET /headers with the request headers it received, so the probe can see whether Anthropic's gateway ever sends a
// store's key to a host other than api.frrata.shop. Its own Vercel project, never the frata app: no data, no secret, no
// database, nothing stored and nothing written to a log. Delete the project once the probe has passed.
module.exports = (req, res) => {
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  if (req.method !== 'GET') { res.statusCode = 405; res.end('{"error":"method"}'); return }
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
  res.statusCode = 200
  res.end(JSON.stringify({ headers }))
}
