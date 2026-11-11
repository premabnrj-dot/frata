// =============================================================================
// FILE: src/domains/video/state.ts — a video's state, derived from its row's timestamps (there is no status column;
// V1, docs/plans/2026-11-09-video-v1.md). Pure: the console's field, the status read and the shop all ask here.
// =============================================================================

/** What a video is for (PV·1): a Look section's muted loop, or a product's video. Each has its own limits; a row
 *  without one is a loop (V1's rows). */
export const VIDEO_USES = ['loop', 'product'] as const
export type VideoUse = (typeof VIDEO_USES)[number]
/**
 * Per use: length, file size, Mux's upload window (seconds) and the MP4 it makes. A loop's are V1's (unit economics
 * 2026-11-09); a product's are PV·1's (docs/plans/2026-11-10-product-video-pv1.md): 6–60 s (Google takes 6 s and up),
 * 250 MB in one PUT, an hour to upload from a phone, one 720p MP4 for the shop and the feeds.
 */
export const USE_LIMITS = {
  loop: { maxMs: 15_000, minMs: 0, maxBytes: 64 * 1024 * 1024, timeoutS: 900, rendition: 'highest' },
  product: { maxMs: 60_000, minMs: 6_000, maxBytes: 250 * 1024 * 1024, timeoutS: 3600, rendition: '720p' },
} as const satisfies Record<VideoUse, { maxMs: number; minMs: number; maxBytes: number; timeoutS: number; rendition: string }>

/**
 * Product video caps by plan (owner, 2026-11-10: "generous, plan-wise"; about 5–10× the use the unit-economics review
 * modelled). Uploads started count in every state (each may have cost a month of storage). `minutes` is the monthly
 * delivered-minutes budget, enforced once Mux's delivery-usage API is wired (PV·1b); recorded here, once.
 */
export type CapPlan = 'trial' | 'launch' | 'growth' | 'scale'
export const PRODUCT_VIDEO_CAPS: Record<CapPlan, { perDay: number; perMonth: number; live: number; minutes: number }> = {
  trial: { perDay: 5, perMonth: 20, live: 50, minutes: 2_000 },
  launch: { perDay: 20, perMonth: 150, live: 300, minutes: 10_000 },
  growth: { perDay: 40, perMonth: 400, live: 1_000, minutes: 40_000 },
  scale: { perDay: 80, perMonth: 1_000, live: 3_000, minutes: 120_000 },
}
/** On every plan: uploads in an hour, and failed fits (too long, short or small) in a day before uploads stop until tomorrow. */
export const PRODUCT_VIDEO_PER_HOUR = 5, PRODUCT_VIDEO_FAILS_PER_DAY = 3
/** Which column of the caps a shop reads: a trial, else its plan (no plan reads as Launch). */
export const capPlan = (code: string | null, onTrial: boolean): CapPlan =>
  onTrial ? 'trial' : code === 'growth' || code === 'scale' ? code : 'launch'

/** Mux's upload URL lives for the use's window; a video still not ready 10 minutes after that, or a row whose upload
 *  Mux never confirmed within 2 minutes (ADR-0008's unknown outcome), didn't work. */
export const NO_UPLOAD_AFTER_MS = 2 * 60_000
export const notReadyAfterMs = (use: VideoUse = 'loop') => (USE_LIMITS[use].timeoutS + 600) * 1000
export const NOT_READY_AFTER_MS = notReadyAfterMs('loop')
/** The longest loop a shop shows (unit-economics review 2026-11-09): longer ones are refused on ready. */
export const MAX_LOOP_MS = USE_LIMITS.loop.maxMs
/** Live videos a shop may hold (pending or ready, not removed or failed). */
export const MAX_LIVE = 20
export const MAX_BYTES = USE_LIMITS.loop.maxBytes
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const

export type VideoRow = {
  uploadId: string | null; playbackId: string | null; createdAt: Date; readyAt: Date | null; mp4ReadyAt: Date | null
  erroredAt: Date | null; error: string | null; removedAt: Date | null
  /** PV·1; absent on V1's callers, which only ever hold loops. */
  use?: VideoUse
  /** TS1b: the MP4 asked for after the checks (null: the use's own). */
  mp4?: string | null
}
/** TS1b (owner 2026-11-11: Frrata pays Mux per minute played, billed at the delivered resolution): a loop asks for its
 *  MP4 once its checks pass — 720p, or from a smaller source the largest size it fills (Mux skips a sized rendition
 *  larger than its source; `highest` can't be asked for alongside sized ones). A V1 loop keeps the `highest` it was
 *  uploaded with. */
const LOOP_SIZES = [720, 540, 480, 360, 270] as const
export function loopMp4(width: number | null, height: number | null): string {
  const short = width && height ? Math.min(width, height) : 720
  return `${LOOP_SIZES.find((n) => short >= n) ?? 270}p`
}
/** The MP4 a video plays: the one asked for, else its use's own (a V1 loop's `highest`, a product's 720p). One rule:
 *  the processor, the sender and the shop's <video> read it here. */
export const mp4Of = (v: { mp4?: string | null; use?: VideoUse }): string => v.mp4 ?? USE_LIMITS[v.use ?? 'loop'].rendition

export type FailedWhy = 'too_long' | 'too_short' | 'too_small' | 'didnt_work'
const NAMED: readonly string[] = ['too_long', 'too_short', 'too_small']
export type VideoState =
  | { kind: 'removed' }
  | { kind: 'failed'; why: FailedWhy }
  | { kind: 'uploading' }   // the row exists; the browser is sending the file (or Mux hasn't said it arrived)
  | { kind: 'preparing' }   // Mux has it and is making the loop
  | { kind: 'playable'; playbackId: string }

export function videoState(v: VideoRow, now: Date): VideoState {
  if (v.removedAt) return { kind: 'removed' }
  if (v.erroredAt) return { kind: 'failed', why: v.error && NAMED.includes(v.error) ? v.error as FailedWhy : 'didnt_work' }
  if (v.mp4ReadyAt && v.playbackId) return { kind: 'playable', playbackId: v.playbackId }
  const age = now.getTime() - v.createdAt.getTime()
  if (!v.uploadId && age > NO_UPLOAD_AFTER_MS) return { kind: 'failed', why: 'didnt_work' }
  if (age > notReadyAfterMs(v.use)) return { kind: 'failed', why: 'didnt_work' }
  return v.readyAt ? { kind: 'preparing' } : { kind: 'uploading' }
}

/** Counts toward the shop's 20: anything not removed and not failed. */
export const isLive = (v: VideoRow, now: Date) => { const s = videoState(v, now).kind; return s !== 'removed' && s !== 'failed' }

/** What the browser may send before anything is asked of Mux. */
export function uploadProblem(contentType: string, size: number, use: VideoUse = 'loop'): string | null {
  if (!(VIDEO_TYPES as readonly string[]).includes(contentType)) return 'Choose an MP4 or MOV video.'
  if (!Number.isInteger(size) || size <= 0) return 'Choose a video.'
  const max = USE_LIMITS[use].maxBytes
  if (size > max) return `Choose a video under ${max / (1024 * 1024)} MB.`
  return null
}

/** What a shopper sees the file as: a reel (taller than wide), a film (wider), or square. */
export function videoShape(width: number | null, height: number | null): 'reel' | 'film' | 'square' | null {
  if (!width || !height) return null
  const r = width / height
  return r < 0.95 ? 'reel' : r > 1.05 ? 'film' : 'square'
}

/** A length as the shop writes it: 0:24, 1:00 (rounded to the second). */
export function clock(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The console's cover-frame strip: eight times across the length, on whole seconds (0, 3, 6 … for a 24 s reel). */
export function coverFrames(durationMs: number | null): number[] {
  const s = Math.floor((durationMs ?? 0) / 1000)
  if (s < 1) return [0]
  const step = Math.max(1, Math.floor(s / 8))
  return Array.from({ length: 8 }, (_, i) => i * step * 1000).filter((ms) => ms < s * 1000 || ms === 0)
}

/** A product video that didn't fit, in words (the length or size it was, and the limit). */
export function failedWords(why: FailedWhy, durationMs: number | null, width: number | null, height: number | null, use: VideoUse = 'product'): string {
  const L = USE_LIMITS[use]
  const short = width && height ? Math.min(width, height) : null
  if (why === 'too_long') return `${durationMs ? `${clock(durationMs)} is too long` : 'Too long'} · up to ${clock(L.maxMs)}`
  if (why === 'too_short') return `${durationMs ? `${clock(durationMs)} is too short` : 'Too short'} · at least ${clock(L.minMs)}`
  if (why === 'too_small') return `${short ? `${short}p is too small` : 'Too small'} · at least 720p`
  return 'Didn’t work'
}
