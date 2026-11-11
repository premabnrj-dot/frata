import 'server-only'
import { clock, coverFrames, failedWords, videoShape, videoState } from '@/domains/video/state'
import { MUX_IMAGE_BASE } from '@/lib/env'
import type { Video } from '@/lib/queries/videos'

// =============================================================================
// FILE: src/lib/video/product-view.ts — what the console's Video card shows of a product's video (PV·1), derived
// from the row, so the page and the status poll agree. Every Mux URL a product video needs is built here and in the
// shop's own builder, so signed playback changes one place (owner 2026-11-10: "we're not letting people download").
// =============================================================================

/** The shop shows product video (PV1-4). Until then the card says so, instead of where it will show. */
export const ON_SHOP = false

export type ProductVideoButton = 'model' | 'wear' | 'none'
export const BUTTONS: readonly ProductVideoButton[] = ['model', 'wear', 'none']

export type ProductVideoView = {
  id: string
  kind: 'uploading' | 'preparing' | 'playable' | 'failed'
  /** Why it failed, in words ("1:10 is too long · up to 1:00"). */
  failed: string | null
  /** "Reel · 9:16", "Film · 16:9", "Square · 1:1". */
  shape: string | null
  size: string | null
  length: string | null
  posterMs: number
  button: ProductVideoButton
  poster: string | null
  frames: { ms: number; url: string; poster: string }[]
}

const SHAPE = { reel: 'Reel · 9:16', film: 'Film · 16:9', square: 'Square · 1:1' } as const

/** Mux's still of a product video at a time (ms), at a width. */
export const productStill = (playbackId: string, ms: number, width: number) =>
  `${MUX_IMAGE_BASE}/${playbackId}/thumbnail.webp?width=${width}&time=${(ms / 1000).toFixed(0)}`

export function productVideoView(v: Video & { posterMs: number; button: string }, now: Date): ProductVideoView | null {
  const s = videoState(v, now)
  if (s.kind === 'removed') return null
  const shape = videoShape(v.width, v.height)
  const button = (BUTTONS as readonly string[]).includes(v.button) ? v.button as ProductVideoButton : 'model'
  const playable = s.kind === 'playable' ? s.playbackId : null
  return {
    id: v.id, kind: s.kind, failed: s.kind === 'failed' ? failedWords(s.why, v.durationMs, v.width, v.height) : null,
    shape: shape ? SHAPE[shape] : null, size: v.width && v.height ? `${v.width} × ${v.height}` : null,
    length: v.durationMs ? clock(v.durationMs) : null, posterMs: v.posterMs, button,
    poster: playable ? productStill(playable, v.posterMs, 400) : null,
    frames: playable ? coverFrames(v.durationMs).map((ms) => ({ ms, url: productStill(playable, ms, 96), poster: productStill(playable, ms, 400) })) : [],
  }
}
