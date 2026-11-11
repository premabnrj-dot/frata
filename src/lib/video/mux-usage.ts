import 'server-only'
import { MUX_API_BASE, MUX_READ_TOKEN_ID, MUX_READ_TOKEN_SECRET, isMuxUsageConfigured } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'

// =============================================================================
// FILE: src/lib/video/mux-usage.ts — Mux's delivery usage for Admin › Infrastructure (plan 2026-11-11 I·1; facts
// frata-integrations § Infrastructure usage, 2026-11-10: GET /video/v1/delivery-usage, per asset, hourly, a window ending
// at least 12 h ago, only assets with delivery, paged). A read with no effect at Mux: no outbox (ADR-0006 amendment).
// Its own READ-ONLY token; never the write token in mux.ts.
// =============================================================================

const ID = /^[A-Za-z0-9]{1,128}$/
const PAGE = 100, PAGES = 50

export type DeliveryRead = { ok: true; assets: { assetId: string; seconds: number }[] } | { ok: false; why: 'not_connected' | 'refused' | 'unavailable' | 'bad_reply' }

/** Delivered seconds per asset over [from, to) (epoch seconds), every page up to 5,000 assets. */
export async function readDelivery(from: number, to: number, deadline: number): Promise<DeliveryRead> {
  if (!isMuxUsageConfigured()) return { ok: false, why: 'not_connected' }
  const auth = `Basic ${Buffer.from(`${MUX_READ_TOKEN_ID}:${MUX_READ_TOKEN_SECRET}`).toString('base64')}`
  const assets: { assetId: string; seconds: number }[] = []
  for (let page = 1; page <= PAGES; page++) {
    const q = new URLSearchParams({ limit: String(PAGE), page: String(page) })
    q.append('timeframe[]', String(from)); q.append('timeframe[]', String(to))
    let res: Response
    try { res = await fetchWithTimeout(`${MUX_API_BASE}/video/v1/delivery-usage?${q}`, { headers: { authorization: auth }, redirect: 'error', cache: 'no-store' }, Math.max(1_000, Math.min(10_000, deadline - Date.now()))) }
    catch { return { ok: false, why: 'unavailable' } }
    if (res.status === 401 || res.status === 403) { await res.body?.cancel(); return { ok: false, why: 'refused' } }
    if (!res.ok) { await res.body?.cancel(); return { ok: false, why: 'unavailable' } }
    const j = await res.json().catch(() => null) as { data?: unknown; total_row_count?: unknown } | null
    if (!j || !Array.isArray(j.data)) return { ok: false, why: 'bad_reply' }
    for (const d of j.data as { asset_id?: unknown; delivered_seconds?: unknown }[]) {
      if (typeof d.asset_id === 'string' && ID.test(d.asset_id) && Number.isFinite(Number(d.delivered_seconds))) assets.push({ assetId: d.asset_id, seconds: Number(d.delivered_seconds) })
    }
    const total = Number(j.total_row_count ?? 0)
    if (j.data.length < PAGE || assets.length >= total || Date.now() > deadline) break
  }
  return { ok: true, assets }
}
