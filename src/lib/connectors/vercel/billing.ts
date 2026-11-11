import 'server-only'
import type { Charge } from '@/domains/infra/vercel'
import { VERCEL_API_BASE, VERCEL_BILLING_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID, isVercelBillingConfigured } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { fakeBase } from '../http'

// =============================================================================
// FILE: src/lib/connectors/vercel/billing.ts — Vercel's billing charges for Admin › Infrastructure (plan 2026-11-11 I·1;
// facts frata-integrations § Infrastructure usage, 2026-11-11). A read with no effect at Vercel: no outbox (ADR-0006
// amendment, plan § architecture review MAJOR 7). Its own token (VERCEL_BILLING_TOKEN), refused if it is wider than
// billing: it must NOT read the project's env (security review HIGH-1). JSONL streamed, capped, only the fields we use.
// =============================================================================

const BASE = fakeBase(VERCEL_API_BASE) ?? 'https://api.vercel.com'
const CAP = 24 * 1024 * 1024
const auth = () => ({ authorization: `Bearer ${VERCEL_BILLING_TOKEN}` })
const q = (o: Record<string, string>) => new URLSearchParams({ ...o, teamId: VERCEL_TEAM_ID }).toString()

export type ChargesRead = { ok: true; charges: Charge[] } | { ok: false; why: 'not_connected' | 'token_too_wide' | 'refused' | 'unavailable' | 'too_large' }

/** True when the token can read the project's environment variables, which a billing token must not. */
async function tooWide(deadline: number): Promise<boolean | null> {
  try {
    const r = await fetchWithTimeout(`${BASE}/v9/projects/${encodeURIComponent(VERCEL_PROJECT_ID)}/env?${q({})}`, { headers: auth(), redirect: 'error', cache: 'no-store' }, Math.min(5_000, deadline - Date.now()))
    await r.body?.cancel()
    return r.ok
  } catch { return null }
}

/** The team's charges between two UTC dates (to exclusive), fields we use only. */
export async function readCharges(from: Date, to: Date, deadline: number): Promise<ChargesRead> {
  if (!isVercelBillingConfigured()) return { ok: false, why: 'not_connected' }
  const wide = await tooWide(deadline)
  if (wide === null) return { ok: false, why: 'unavailable' }
  if (wide) return { ok: false, why: 'token_too_wide' }
  try {
    const r = await fetchWithTimeout(`${BASE}/v1/billing/charges?${q({ from: from.toISOString(), to: to.toISOString() })}`,
      { headers: { ...auth(), accept: 'application/jsonl', 'accept-encoding': 'gzip' }, redirect: 'error', cache: 'no-store' }, Math.max(1_000, deadline - Date.now()))
    if (r.status === 401 || r.status === 403) { await r.body?.cancel(); return { ok: false, why: 'refused' } }
    if (r.status === 404) { await r.body?.cancel(); return { ok: true, charges: [] } } // no costs yet (a new cycle)
    if (!r.ok || !r.body) { await r.body?.cancel(); return { ok: false, why: 'unavailable' } }
    const reader = r.body.getReader(), dec = new TextDecoder()
    let size = 0, rest = ''
    const charges: Charge[] = []
    const take = (line: string) => {
      if (!line.trim()) return
      try {
        const o = JSON.parse(line) as Record<string, unknown>
        charges.push({ ChargePeriodStart: String(o.ChargePeriodStart ?? ''), ServiceName: String(o.ServiceName ?? ''), ChargeCategory: String(o.ChargeCategory ?? ''),
          EffectiveCost: (o.EffectiveCost as number | string) ?? 0, ConsumedQuantity: (o.ConsumedQuantity as number | string | null) ?? null, ConsumedUnit: (o.ConsumedUnit as string | null) ?? null,
          Tags: o.Tags && typeof o.Tags === 'object' ? { ProjectName: String((o.Tags as Record<string, unknown>).ProjectName ?? '') } : null })
      } catch { /* a line that isn't JSON is skipped */ }
    }
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > CAP) { await reader.cancel(); return { ok: false, why: 'too_large' } }
      const text = rest + dec.decode(value, { stream: true })
      const lines = text.split('\n')
      rest = lines.pop() ?? ''
      lines.forEach(take)
    }
    take(rest + dec.decode())
    return { ok: true, charges }
  } catch { return { ok: false, why: 'unavailable' } }
}
