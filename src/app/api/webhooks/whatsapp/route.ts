import { after, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { META_APP_SECRET, WA_VERIFY_TOKEN } from '@/lib/env'
import { verifyMetaSignature } from '@/lib/meta/signature'
import { processWhatsApp, storeWebhook } from '@/lib/modules/communication/webhook'

// ENTRY POINT credential: Meta's X-Hub-Signature-256 over the raw body with Frrata's app secret (scripts/check-actions.mjs).
// One URL for every shop: each item is routed by its own number or account id (app_tenant_for_wa / _waba),
// never by anything else in the payload. Stored, answered 200 at once (Meta retries for 7 days), processed in after().

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams
  const token = q.get('hub.verify_token') ?? '', challenge = q.get('hub.challenge') ?? ''
  const a = Buffer.from(token), b = Buffer.from(WA_VERIFY_TOKEN)
  const ok = q.get('hub.mode') === 'subscribe' && WA_VERIFY_TOKEN !== '' && a.length === b.length && timingSafeEqual(a, b)
  if (!ok || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) return new NextResponse('forbidden', { status: 403 })
  return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (raw.length > 3_500_000) return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), META_APP_SECRET)) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const shops = await storeWebhook(body)
  const now = new Date()
  after(async () => {
    for (const t of shops) await processWhatsApp(t, now).catch((e) => console.error('[whatsapp webhook] process', t, e instanceof Error ? e.name : 'error'))
  })
  return NextResponse.json({ ok: true })
}
