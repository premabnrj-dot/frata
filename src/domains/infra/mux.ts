import type { MicroUsd } from '@/domains/money/usd'
import { capPlan, isLive, PRODUCT_VIDEO_CAPS, videoState, type VideoUse } from '@/domains/video/state'
import type { Alert } from './alerts'
import { MUX } from './rates'

// =============================================================================
// FILE: src/domains/infra/mux.ts — the Mux tab: delivery read from Mux (per asset per day, 12 h behind) and Frrata's own
// video facts (admin_video_usage, drizzle/0095) into the month's picture, an ESTIMATED cost (Mux has no bill API:
// frata-integrations § Infrastructure usage) and its alerts. Live, failed and caps come from videoState and
// PRODUCT_VIDEO_CAPS, never restated (architecture review MINOR). Pure.
// =============================================================================

export type VideoFact = {
  assetId: string | null; tenantId: string; shop: string; plan: string | null; onTrial: boolean; use: VideoUse
  durationMs: number | null; createdAt: Date; uploaded: boolean; readyAt: Date | null; mp4ReadyAt: Date | null
  erroredAt: Date | null; error: string | null; removedAt: Date | null; product: string | null
}
export type Delivery = { day: string; assetId: string; minutes: number }

export type MuxFacts = {
  dayOfMonth: number; daysInMonth: number
  deliveredMinutes: number; projectedMinutes: number; freeMinutes: number
  liveVideos: number; liveProduct: number; liveLoops: number
  storedMinutes: number; mp4Minutes: number
  uploadsToday: number; failedToday: number
  estimateMicros: MicroUsd
  top: { assetId: string; shop: string; label: string; minutes: number; share: number }[]
  shops: { tenantId: string; shop: string; plan: string; liveProduct: number; cap: number; minutes: number }[]
}

const stateRow = (v: VideoFact) => ({
  uploadId: v.uploaded ? 'u' : null, playbackId: v.readyAt ? 'p' : null, createdAt: v.createdAt, readyAt: v.readyAt,
  mp4ReadyAt: v.mp4ReadyAt, erroredAt: v.erroredAt, error: v.error, removedAt: v.removedAt, use: v.use,
})

export function muxFacts(delivery: readonly Delivery[], videos: readonly VideoFact[], now: Date): MuxFacts {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), startDay = start.toISOString().slice(0, 10)
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  const month = delivery.filter((d) => d.day >= startDay)
  const delivered = month.reduce((a, d) => a + d.minutes, 0)
  // Delivery is 12 h behind: pace over the days it covers, not the days elapsed.
  const covered = Math.max(1 / 24, (now.getTime() - 12 * 3_600_000 - start.getTime()) / 86_400_000)
  const live = videos.filter((v) => isLive(stateRow(v), now))
  const minutes = (vs: readonly VideoFact[]) => vs.reduce((a, v) => a + (v.durationMs ?? 0), 0) / 60_000
  const today = now.toISOString().slice(0, 10)
  const todays = videos.filter((v) => v.createdAt.toISOString().slice(0, 10) === today)
  const byAsset = new Map<string, number>()
  for (const d of month) byAsset.set(d.assetId, (byAsset.get(d.assetId) ?? 0) + d.minutes)
  const video = new Map(videos.filter((v) => v.assetId).map((v) => [v.assetId as string, v]))
  const top = [...byAsset.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([assetId, m]) => {
    const v = video.get(assetId)
    return { assetId, shop: v?.shop ?? 'Unknown', label: v ? (v.use === 'product' ? v.product ?? 'A removed product' : 'Look loop') : 'Not in Frrata', minutes: Math.round(m), share: delivered ? m / delivered : 0 }
  })
  const shops = new Map<string, MuxFacts['shops'][number]>()
  for (const v of videos) {
    const plan = capPlan(v.plan, v.onTrial)
    const s = shops.get(v.tenantId) ?? { tenantId: v.tenantId, shop: v.shop, plan, liveProduct: 0, cap: PRODUCT_VIDEO_CAPS[plan].live, minutes: 0 }
    if (v.use === 'product' && isLive(stateRow(v), now)) s.liveProduct++
    if (v.assetId) s.minutes += byAsset.get(v.assetId) ?? 0
    shops.set(v.tenantId, s)
  }
  const stored = minutes(live), mp4 = minutes(live.filter((v) => v.mp4ReadyAt))
  const prepared = minutes(videos.filter((v) => v.use === 'product' && v.mp4ReadyAt && v.createdAt >= start))
  const estimate = stored * MUX.storagePerMinuteMonthUsd + mp4 * MUX.mp4StoragePerMinuteMonthUsd + prepared * MUX.renditionPrepPerMinuteUsd
    + Math.max(0, delivered / covered * daysInMonth - MUX.freeDeliveryMinutes) * MUX.deliveryPerMinuteUsd
  return {
    dayOfMonth: now.getUTCDate(), daysInMonth,
    deliveredMinutes: Math.round(delivered), projectedMinutes: Math.round(delivered / covered * daysInMonth), freeMinutes: MUX.freeDeliveryMinutes,
    liveVideos: live.length, liveProduct: live.filter((v) => v.use === 'product').length, liveLoops: live.filter((v) => v.use === 'loop').length,
    storedMinutes: Math.round(stored), mp4Minutes: Math.round(mp4),
    uploadsToday: todays.length, failedToday: todays.filter((v) => videoState(stateRow(v), now).kind === 'failed').length,
    estimateMicros: Math.round(estimate * 1e6) as MicroUsd,
    top, shops: [...shops.values()].filter((s) => s.liveProduct > 0 || s.minutes > 0).sort((a, b) => b.minutes - a.minutes).map((s) => ({ ...s, minutes: Math.round(s.minutes) })),
  }
}

export const MUX_RULES = { videoShare: 0.25, videoMinMinutes: 1000, failedShare: 0.2, failedMinUploads: 5 } as const

export function muxAlerts(f: MuxFacts): Alert[] {
  const out: Alert[] = []
  if (f.projectedMinutes > f.freeMinutes) {
    out.push({ key: 'mux.pace', tab: 'mux', level: 'soon', title: `Delivery on pace for ${f.projectedMinutes.toLocaleString('en-IN')} minutes`, why: `Past ${f.freeMinutes.toLocaleString('en-IN')} free, $${MUX.deliveryPerMinuteUsd} a minute` })
  }
  const big = f.top[0]
  if (big && big.share > MUX_RULES.videoShare && big.minutes >= MUX_RULES.videoMinMinutes) {
    out.push({ key: 'mux.video', tab: 'mux', level: 'soon', title: `One video is ${Math.round(big.share * 100)}% of delivery`, why: `${big.shop} · ${big.label} · ${big.minutes.toLocaleString('en-IN')} minutes this month` })
  }
  if (f.uploadsToday >= MUX_RULES.failedMinUploads && f.failedToday / f.uploadsToday > MUX_RULES.failedShare) {
    out.push({ key: 'mux.failed', tab: 'mux', level: 'soon', title: `${f.failedToday} of ${f.uploadsToday} uploads didn’t work today`, why: 'Too long, too short, under 720p or lost' })
  }
  return out
}
