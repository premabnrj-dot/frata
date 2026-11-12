// Test-only stand-in for Vercel Blob's public store in the local end-to-end run (BLOB_STORE_ID store_e2e →
// e2e.public.blob.vercel-storage.com). Never deployed. A flow stores what the browser uploaded with PUT /_test/put
// ?pathname=… (it stands in for the upload API with Playwright's routing); the app reads a file's first bytes
// (photosAreMade) as GET /<pathname>, reached through blob-read.mjs. A Range header answers 206 with those bytes.
import http from 'node:http'

const files = new Map() // pathname → Buffer

http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const u = new URL(req.url, 'http://x')
    if (req.method === 'PUT' && u.pathname === '/_test/put') {
      files.set(u.searchParams.get('pathname'), Buffer.concat(chunks))
      res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":true}')
    }
    if (req.method === 'POST' && u.pathname === '/_test/reset') { files.clear(); res.writeHead(200); return res.end() }
    const body = files.get(decodeURIComponent(u.pathname.slice(1)))
    if (req.method !== 'GET' || !body) { res.writeHead(404); return res.end('not found') }
    const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
    if (range) {
      const part = body.subarray(Number(range[1]), Number(range[2]) + 1)
      res.writeHead(206, { 'content-type': 'application/octet-stream', 'content-range': `bytes ${range[1]}-${Number(range[1]) + part.length - 1}/${body.length}` })
      return res.end(part)
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream' }); res.end(body)
  })
}).listen(Number(process.env.PORT), '127.0.0.1')
