import { NextResponse } from 'next/server'
import { pullMux, pullVercel } from '@/lib/admin/infra'
import { isCronRequest } from '@/lib/auth/cron'
import { errName } from '@/lib/log'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// Admin › Infrastructure (plan docs/plans/2026-11-11-guardrails-infra-a2.md I·1): the hourly read of what vendors bill
// Frrata. Reads only (no outbox: ADR-0006 amendment, plan MAJOR 7): every call deadlined, sources settled independently,
// no transaction open across a call, writes idempotent upserts of platform rows.

export const maxDuration = 60

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  const now = new Date(), deadline = Date.now() + 50_000
  const [vercel, mux] = await Promise.allSettled([pullVercel(now, deadline), pullMux(now, deadline)])
  const out = (name: string, r: PromiseSettledResult<{ ok: boolean; why: string | null }>) => {
    if (r.status === 'rejected') { console.error(`[cron] infra ${name}`, errName(r.reason)); return 'error' }
    return r.value.ok ? 'ok' : r.value.why
  }
  return NextResponse.json({ vercel: out('vercel', vercel), mux: out('mux', mux) })
}
