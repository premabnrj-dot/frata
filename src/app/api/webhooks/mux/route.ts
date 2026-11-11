import { after, NextResponse } from 'next/server'
import { storeMuxEvent } from '@/lib/db/platform'
import { MUX_ENVIRONMENT_ID, MUX_WEBHOOK_SECRET, MUX_WEBHOOK_SECRET_PREVIOUS } from '@/lib/env'
import { errName } from '@/lib/log'
import { processMux } from '@/lib/video/process'
import { MAX_BODY, muxEventFields, verifyMuxSignature } from '@/lib/video/webhook'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 60

// ENTRY POINT credential: Mux's mux-signature, an HMAC of `t.body` with Frrata's webhook secret (current or previous),
// within 5 minutes (scripts/check-actions.mjs). One URL for every shop: each event is routed by the definer
// (drizzle/0081 app_store_mux_event) by OUR video id and its upload id, in our own Mux environment. Stored, answered
// 200 at once (Mux retries for 24 h), processed in after() by reading the asset from Mux (src/lib/video/process.ts).

async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.byteLength
    if (n > max) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function POST(request: Request) {
  // Refused before the body is read, and read with a running count (a chunked body has no Content-Length).
  const len = Number(request.headers.get('content-length') ?? '0')
  if (!Number.isFinite(len) || len > MAX_BODY) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const raw = await readCapped(request, MAX_BODY)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (!verifyMuxSignature(raw, request.headers.get('mux-signature'), [MUX_WEBHOOK_SECRET, MUX_WEBHOOK_SECRET_PREVIOUS], Math.floor(Date.now() / 1000))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const f = muxEventFields(body)
  // Not one of ours (another environment, an event we don't take, nothing that names a video): 200, so Mux stops.
  if (!f || f.env !== MUX_ENVIRONMENT_ID) return NextResponse.json({ ok: true })
  // Null means nothing matched OR stored before (a retry): 200 either way.
  const shop = await storeMuxEvent(f).catch((e) => { console.error('[mux webhook] store', errName(e)); throw e })
  if (shop) after(() => processMux(shop).then(() => undefined, (e) => console.error('[mux webhook] process', errName(e))))
  return NextResponse.json({ ok: true })
}
