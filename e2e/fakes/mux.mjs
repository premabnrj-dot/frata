// Test-only stand-in for Mux (MUX_API_BASE, MUX_STREAM_BASE and MUX_IMAGE_BASE in the local end-to-end run). Never deployed.
// The API (uploads, assets, delete, cancel) behind Basic auth; an upload URL on this host that takes the browser's PUT;
// then signed webhooks back to the app, as Mux sends them: upload.asset_created, asset.ready, static_rendition.ready.
// A file holding the bytes "LONG" becomes a 20-second asset (the too-long path). Serves the MP4 and the poster.
// PV·1: the rendition asked for is the one made (`720p.mp4` for a product); a product upload is a 24.4 s reel at
// 1080 × 1920; "XLONG" is 70 s, "SHORT" 3 s, and "SMALL" makes Mux skip the 720p (a smaller source).
import http from 'node:http'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { MUX } from '../constants.mjs'

const APP = process.env.APP
const PORT = Number(process.env.PORT)
const BASE = `http://localhost:${PORT}`
const MP4 = readFileSync(new URL('../fixtures/loop.mp4', import.meta.url))
const uploads = new Map(), assets = new Map(), deleted = [], cancelled = []
const hex = (n) => crypto.randomBytes(n).toString('hex')
const authOk = (req) => req.headers.authorization === 'Basic ' + Buffer.from(`${MUX.tokenId}:${MUX.tokenSecret}`).toString('base64')
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT, OPTIONS', 'access-control-allow-headers': 'content-type' }
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...cors, ...headers }); res.end(body === undefined ? '' : JSON.stringify(body)) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function hook(type, data) {
  const raw = JSON.stringify({ type, id: crypto.randomUUID(), created_at: new Date().toISOString(), environment: { id: MUX.env, name: 'e2e' }, object: { type: type.split('.')[1], id: data.id }, data })
  const t = Math.floor(Date.now() / 1000)
  const sig = crypto.createHmac('sha256', MUX.webhook).update(`${t}.${raw}`).digest('hex')
  await fetch(`${APP}/api/webhooks/mux`, { method: 'POST', headers: { 'content-type': 'application/json', 'mux-signature': `t=${t},v1=${sig}` }, body: raw }).catch(() => {})
}

async function arrive(up, body) {
  const has = (m) => body.includes(Buffer.from(m))
  const res = up.new_asset_settings.static_renditions?.[0]?.resolution ?? 'highest', product = res !== 'highest'
  const duration = has('XLONG') ? 70.04 : has('LONG') ? 20.04 : has('SHORT') ? 3.0 : product ? 24.4 : 1.0
  const a = { id: 'as' + hex(8), status: 'preparing', passthrough: up.new_asset_settings.passthrough, upload_id: up.id, playback_ids: [], tracks: [], duration: undefined, static_renditions: { files: [] } }
  assets.set(a.id, a); up.status = 'asset_created'; up.asset_id = a.id
  await hook('video.upload.asset_created', { ...up })
  await sleep(300)
  Object.assign(a, { status: 'ready', duration, playback_ids: [{ id: 'pb' + hex(8), policy: 'public' }], tracks: [{ type: 'video', max_width: product ? 1080 : 96, max_height: product ? 1920 : 54 }] })
  await hook('video.asset.ready', { ...a })
  await sleep(300)
  const status = has('SMALL') && product ? 'skipped' : 'ready'
  a.static_renditions = { files: [{ id: 'r' + hex(4), name: `${res}.mp4`, resolution: res, status, ext: 'mp4' }] }
  await hook(`video.asset.static_rendition.${status}`, { id: a.static_renditions.files[0].id, asset_id: a.id, status })
}

http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const body = Buffer.concat(chunks); const u = new URL(req.url, BASE); const p = u.pathname
    if (req.method === 'OPTIONS') return send(res, 204)
    if (p === '/_test/state') return send(res, 200, { uploads: [...uploads.values()], assets: [...assets.values()], deleted, cancelled })
    // The browser's upload (no auth: the URL is the credential, as at Mux).
    if (req.method === 'PUT' && p.startsWith('/_upload/')) {
      const up = uploads.get(p.slice(9)); if (!up || up.status !== 'waiting') return send(res, 404, {})
      send(res, 200, {}); void arrive(up, body); return
    }
    if (req.method === 'GET' && p.startsWith('/stream/')) { res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': MP4.length, 'accept-ranges': 'bytes' }); return res.end(MP4) }
    if (req.method === 'GET' && p.startsWith('/image/')) { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="54"><rect width="96" height="54" fill="#2742E8"/></svg>') }
    if (!authOk(req)) return send(res, 401, { error: { type: 'unauthorized' } })
    const json = body.length ? JSON.parse(body.toString()) : {}
    if (req.method === 'POST' && p === '/video/v1/uploads') {
      // Refuses what Mux refuses (2026-11-09: a 720p max_resolution_tier reached production as a 400 on every upload).
      const nas = json.new_asset_settings ?? {}
      const bad = (nas.max_resolution_tier !== undefined && !['1080p', '1440p', '2160p'].includes(nas.max_resolution_tier))
        || (nas.video_quality !== undefined && !['basic', 'plus', 'premium'].includes(nas.video_quality))
        || (nas.static_renditions ?? []).some((r) => !['highest', 'audio-only', '2160p', '1440p', '1080p', '720p', '540p', '480p', '360p', '270p'].includes(r?.resolution))
        || ((nas.static_renditions ?? []).some((r) => r?.resolution === 'highest') && (nas.static_renditions ?? []).some((r) => /^\d+p$/.test(r?.resolution)))
        || 'mp4_support' in nas || typeof json.cors_origin !== 'string' || (nas.passthrough ?? '').length > 255
      if (bad) return send(res, 400, { error: { type: 'invalid_parameters', messages: ['new_asset_settings is invalid'] } })
      const id = 'up' + hex(8)
      const up = { id, url: `${BASE}/_upload/${id}`, status: 'waiting', timeout: json.timeout, cors_origin: json.cors_origin, new_asset_settings: json.new_asset_settings }
      uploads.set(id, up); return send(res, 201, { data: up })
    }
    let m
    if ((m = p.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)\/cancel$/)) && req.method === 'PUT') { cancelled.push(m[1]); const up = uploads.get(m[1]); if (up) up.status = 'cancelled'; return send(res, 200, { data: up ?? {} }) }
    if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)$/))) {
      const a = assets.get(m[1])
      if (req.method === 'GET') return a ? send(res, 200, { data: a }) : send(res, 404, { error: { type: 'not_found' } })
      if (req.method === 'DELETE') { if (!a) return send(res, 404, {}); assets.delete(m[1]); deleted.push(m[1]); res.writeHead(204, cors); return res.end() }
    }
    return send(res, 404, { error: { type: 'not_found' } })
  })
}).listen(PORT)
