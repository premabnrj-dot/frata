// Test-only stand-in for Vercel's domains API and DNS-over-HTTPS (VERCEL_API_BASE and DOH_BASE in the local end-to-end
// run; honoured only on 127.0.0.1 off Vercel). Never deployed. The flow sets DNS records at /_test/dns and reads what
// was added at /_test/added. Certificates: /cert answers for any host on the project.
import http from 'node:http'

const added = new Set()
const records = new Map() // "name|TYPE" → [data]
const TYPES = { A: 1, NS: 2, CNAME: 5, TXT: 16, CAA: 257 }
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }

http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x'); const body = raw ? JSON.parse(raw) : {}
    const p = u.pathname
    if (p === '/_test/dns') { records.set(`${body.name}|${body.type}`, body.data); return send(res, 200, { ok: true }) }
    if (p === '/_test/added') return send(res, 200, [...added])
    if (p === '/_test/reset') { added.clear(); records.clear(); return send(res, 200, { ok: true }) }
    if (p === '/cloudflare' || p === '/google') {
      const name = u.searchParams.get('name'), type = u.searchParams.get('type')
      const data = records.get(`${name}|${type}`) ?? (type === 'NS' ? ['ns51.domaincontrol.com.'] : null)
      if (!data) return send(res, 200, { Status: 3 })
      return send(res, 200, { Status: 0, Answer: data.map((d) => ({ name: `${name}.`, type: TYPES[type], data: d })) })
    }
    if (p === '/cert') return send(res, added.has(u.searchParams.get('host')) ? 200 : 404, {})
    let m
    if (req.method === 'POST' && /^\/v10\/projects\/[^/]+\/domains$/.test(p)) { added.add(body.name); return send(res, 200, { name: body.name }) }
    if ((m = /^\/v9\/projects\/[^/]+\/domains\/([^/]+)\/verify$/.exec(p))) return send(res, 200, { verified: true })
    if ((m = /^\/v9\/projects\/[^/]+\/domains\/([^/]+)$/.exec(p))) {
      const d = decodeURIComponent(m[1])
      if (req.method === 'DELETE') { added.delete(d); return send(res, 200, {}) }
      return added.has(d) ? send(res, 200, { name: d, verified: true }) : send(res, 404, { error: { code: 'not_found' } })
    }
    if (/^\/v6\/domains\/[^/]+\/config$/.test(p)) return send(res, 200, { misconfigured: false, recommendedIPv4: [{ rank: 1, value: ['76.76.21.21'] }], recommendedCNAME: [{ rank: 1, value: 'e2e.vercel-dns-017.com.' }] })
    send(res, 404, {})
  })
}).listen(Number(process.env.PORT ?? 4030), '127.0.0.1')
