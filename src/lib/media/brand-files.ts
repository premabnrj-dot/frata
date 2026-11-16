import 'server-only'
import { createHash } from 'node:crypto'
import { put } from '@vercel/blob'
import { after } from 'next/server'
import { BLOB_READ_WRITE_TOKEN, BLOB_STORE_ID, E2E_BLOB_PORT, isBlobConfigured } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { errName } from '@/lib/log'
import { storeHost } from '@/domains/media/sizes'
import { acceptedBrandFile, svgPath } from '@/domains/brand/files'
import { renditionPathFor, renditionUrl } from './rendition'
import { cleanSvg, SVG_REFUSAL_WORDS } from '@/domains/brand/svg'

// =============================================================================
// FILE: src/lib/media/brand-files.ts — A BRAND'S FILES THAT FRRATA'S SERVER WRITES (one-address plan P1·4; spec § 5).
// - An SVG logo is never uploaded by the browser (its upload token allows WebP and JPEG photos only): its text comes to
//   the server, is written again by the allowlist cleaner (src/domains/brand/svg.ts) and stored under its own sha256,
//   as `image/svg+xml`, never overwritten. Everyone shows it through <img> only (an <img> runs no script).
// - The main logo's PNG rendition (sharp), for paper and email (mail clients and the PDF renderer read neither SVG nor
//   WebP): tenants/<t>/documents/<sha256 of the main logo's URL>.png, made after a save commits, read by derivation
//   (renditionUrl), stored nowhere else. `doc_logo` stays the owner's own upload; a document reads it first.
// =============================================================================

const MAX_RENDITION_W = 600, MAX_RENDITION_H = 200

const sha256 = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex')
const publicUrl = (path: string) => { const host = storeHost(BLOB_STORE_ID); return host ? `https://${host}/${path}` : null }

/** Writes a file to the store's media folder: Vercel Blob, or the e2e stack's stand-in in the local run. Never overwrites. */
async function putFile(path: string, body: Buffer, contentType: string): Promise<void> {
  if (E2E_BLOB_PORT) {
    const r = await fetchWithTimeout(`http://127.0.0.1:${E2E_BLOB_PORT}/_test/put?pathname=${encodeURIComponent(path)}`, { method: 'PUT', body: new Uint8Array(body) })
    if (!r.ok) throw new Error('blob_put')
    return
  }
  try {
    await put(path, body, { access: 'public', token: BLOB_READ_WRITE_TOKEN, contentType, addRandomSuffix: false, allowOverwrite: false, cacheControlMaxAge: 31536000 })
  } catch (e) {
    // The same bytes under the same name are already there (a second upload of one file): nothing to do.
    if (!/already exists/i.test(e instanceof Error ? e.message : '')) throw e
  }
}

/** Clean an SVG logo the person chose and store it in this store's brand folder. Its URL, or the reason in words. */
export async function storeSvgLogo(tenantId: string, text: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isBlobConfigured()) return { ok: false, error: 'Photo storage is not connected.' }
  const r = cleanSvg(text)
  if (!r.ok) return { ok: false, error: SVG_REFUSAL_WORDS[r.reason] }
  const bytes = Buffer.from(r.svg, 'utf8')
  const path = svgPath(tenantId, sha256(bytes))
  const url = publicUrl(path)
  if (!url) return { ok: false, error: 'Photo storage is not connected.' }
  try { await putFile(path, bytes, 'image/svg+xml') } catch (e) { console.error('[brand svg]', errName(e)); return { ok: false, error: 'That upload was refused. Try again in a minute.' } }
  return { ok: true, url }
}

/** Whether a cleaned SVG is really in the store (saveBrand asks before a URL is saved). */
export async function svgIsStored(url: string): Promise<boolean> {
  try {
    const r = await fetchWithTimeout(url, { method: 'GET', headers: { Range: 'bytes=0-63' } }, 4000)
    if (!(r.ok || r.status === 206)) return false
    return /<svg[\s>]/i.test(new TextDecoder().decode(new Uint8Array(await r.arrayBuffer())))
  } catch { return false }
}

/** Makes the PNG rendition of the main logo from its own bytes (an SVG through sharp's renderer, which fetches nothing). */
async function makeRendition(tenantId: string, mainUrl: string): Promise<boolean> {
  const host = storeHost(BLOB_STORE_ID)
  const f = host ? acceptedBrandFile(mainUrl, host, tenantId) : null
  if (!f) return false
  try {
    const r = await fetchWithTimeout(f.url, {}, 8000)
    if (!r.ok) return false
    const src = Buffer.from(await r.arrayBuffer())
    if (src.length > 3 * 1024 * 1024) return false
    const { default: sharp } = await import('sharp')
    const png = await sharp(src, { density: f.kind === 'svg' ? 288 : 72, limitInputPixels: 4096 * 4096 })
      .resize({ width: MAX_RENDITION_W, height: MAX_RENDITION_H, fit: 'inside', withoutEnlargement: f.kind !== 'svg' }).png({ compressionLevel: 9 }).toBuffer()
    await putFile(renditionPathFor(tenantId, f.url), png, 'image/png')
    return true
  } catch (e) {
    console.error('[brand rendition]', errName(e))
    return false
  }
}

/** Made already, by this process or found in the store: no second fetch for the same logo. */
const made = new Set<string>()
/** The rendition of this main logo, made if the store doesn't have it yet (a save's after() that failed, a raster logo
 *  from before the store had a website): looked for first, so a print or a pack costs one small read at most. */
export async function ensureRendition(tenantId: string, mainUrl: string): Promise<boolean> {
  const url = renditionUrl(tenantId, mainUrl)
  if (!url) return false
  if (made.has(url)) return true
  try {
    const r = await fetchWithTimeout(url, { method: 'GET', headers: { Range: 'bytes=0-7' } }, 4000)
    if (r.ok || r.status === 206) { made.add(url); return true }
  } catch { /* not reachable now: try to make it */ }
  if (!(await makeRendition(tenantId, mainUrl))) return false
  made.add(url)
  return true
}

/** After the response (a save that changed the main logo, a pack, a print): its rendition, made once. A failure leaves
 *  paper on the store's name, and the next read tries again. */
export function afterMainLogo(tenantId: string, mainUrl: string | null) {
  if (!mainUrl) return
  const work = async () => { await ensureRendition(tenantId, mainUrl) }
  try { after(work) } catch { void work() }
}

/**
 * The main logo where only a raster file can go (the API's shop.logo, M7; the store's icon): a PNG or WebP main logo as
 * it is, an SVG one as its PNG rendition, made after the response if it isn't yet. The one place this rule lives.
 */
export function rasterLogo(tenantId: string, mainUrl: string | null): string | null {
  if (!mainUrl || !/\.svg$/.test(mainUrl)) return mainUrl
  afterMainLogo(tenantId, mainUrl)
  return renditionUrl(tenantId, mainUrl)
}
