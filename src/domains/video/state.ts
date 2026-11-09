// =============================================================================
// FILE: src/domains/video/state.ts — a video's state, derived from its row's timestamps (there is no status column;
// V1, docs/plans/2026-11-09-video-v1.md). Pure: the console's field, the status read and the shop all ask here.
// =============================================================================

/** Mux's upload URL lives 15 minutes (src/lib/video/mux.ts UPLOAD_TIMEOUT_S); a video still not ready 10 minutes
 *  after that, or a row whose upload Mux never confirmed within 2 minutes (ADR-0008's unknown outcome), didn't work. */
export const NO_UPLOAD_AFTER_MS = 2 * 60_000
export const NOT_READY_AFTER_MS = (900 + 600) * 1000
/** The longest loop a shop shows (unit-economics review 2026-11-09): longer ones are refused on ready. */
export const MAX_LOOP_MS = 15_000
/**
 * Which MP4 the shop plays (unit-economics review: 720p, billed at the delivered resolution). Mux makes a 720p file
 * only from a larger source (no upscaling; it skips it otherwise), so a source whose shorter side is above 720 plays
 * `720p.mp4`, and anything smaller plays `highest.mp4` (then 720p or less anyway). Mux's max_resolution_tier takes
 * only 1080p and up, so the cap lives here, not there (2026-11-09: a 720p tier made every upload a 400).
 */
export function mp4Name(width: number | null, height: number | null): '720p' | 'highest' {
  return width !== null && height !== null && Math.min(width, height) > 720 ? '720p' : 'highest'
}

/** Live videos a shop may hold (pending or ready, not removed or failed). */
export const MAX_LIVE = 20
export const MAX_BYTES = 64 * 1024 * 1024
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const

export type VideoRow = {
  uploadId: string | null; playbackId: string | null; createdAt: Date; readyAt: Date | null; mp4ReadyAt: Date | null
  erroredAt: Date | null; error: string | null; removedAt: Date | null
}
export type VideoState =
  | { kind: 'removed' }
  | { kind: 'failed'; why: 'too_long' | 'didnt_work' }
  | { kind: 'uploading' }   // the row exists; the browser is sending the file (or Mux hasn't said it arrived)
  | { kind: 'preparing' }   // Mux has it and is making the loop
  | { kind: 'playable'; playbackId: string }

export function videoState(v: VideoRow, now: Date): VideoState {
  if (v.removedAt) return { kind: 'removed' }
  if (v.erroredAt) return { kind: 'failed', why: v.error === 'too_long' ? 'too_long' : 'didnt_work' }
  if (v.mp4ReadyAt && v.playbackId) return { kind: 'playable', playbackId: v.playbackId }
  const age = now.getTime() - v.createdAt.getTime()
  if (!v.uploadId && age > NO_UPLOAD_AFTER_MS) return { kind: 'failed', why: 'didnt_work' }
  if (age > NOT_READY_AFTER_MS) return { kind: 'failed', why: 'didnt_work' }
  return v.readyAt ? { kind: 'preparing' } : { kind: 'uploading' }
}

/** Counts toward the shop's 20: anything not removed and not failed. */
export const isLive = (v: VideoRow, now: Date) => { const s = videoState(v, now).kind; return s !== 'removed' && s !== 'failed' }

/** What the browser may send before anything is asked of Mux. */
export function uploadProblem(contentType: string, size: number): string | null {
  if (!(VIDEO_TYPES as readonly string[]).includes(contentType)) return 'Choose an MP4 or MOV video.'
  if (!Number.isInteger(size) || size <= 0) return 'Choose a video.'
  if (size > MAX_BYTES) return 'Choose a video under 64 MB.'
  return null
}
