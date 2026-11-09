import { after, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { EKCODE_META_APP_SECRET, EKCODE_WA_VERIFY_TOKEN } from '@/lib/env'
import { verifyMetaSignature } from '@/lib/meta/signature'
import { readCapped, storeEkcodeWebhook } from '@/lib/ekcode/webhook'
import { applyEvents } from '@/lib/db/ekcode'

// ENTRY POINT credential: Meta's X-Hub-Signature-256 over the raw body with EkCode's own app secret (scripts/check-actions.mjs).
// A second webhook URL because EkCode is a separate Meta app in its own portfolio, with its own secret (ADR-0010);
// the signature check is shared (src/lib/meta). Stored trimmed, answered at once, applied in after() and by the cron.

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const token = q.get('hub.verify_token') ?? '', challenge = q.get('hub.challenge') ?? ''
  const a = Buffer.from(token), b = Buffer.from(EKCODE_WA_VERIFY_TOKEN)
  const ok = q.get('hub.mode') === 'subscribe' && EKCODE_WA_VERIFY_TOKEN !== '' && a.length === b.length && timingSafeEqual(a, b)
  if (!ok || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) return new NextResponse('forbidden', { status: 403 })
  return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
}

export async function POST(request: Request) {
  const raw = await readCapped(request, 256 * 1024)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), EKCODE_META_APP_SECRET)) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const stored = await storeEkcodeWebhook(body)
  if (stored) after(async () => { await applyEvents(500).catch((e) => console.error('[ekcode webhook] apply', e instanceof Error ? e.name : 'error')) })
  return NextResponse.json({ ok: true })
}
