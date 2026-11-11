import { MUX_IMAGE_BASE, MUX_STREAM_BASE } from '@/lib/env'
import type { LookVideos } from '@/lib/themes/page-look'

/**
 * V1: a section's muted loop, laid over its photo (the photo is the first paint and stays the fallback). No source
 * until the player island sees it in view (preload none: a loop costs Frrata per minute delivered); hidden from
 * assistive tech (it is decoration; the photo carries the alt text). A playback id that isn't Mux's shape is not drawn.
 */
export function Loop({ id, videos }: { id: string | undefined; videos: LookVideos | undefined }) {
  const v = id ? videos?.[id] : undefined
  if (!v || !/^[A-Za-z0-9]{1,64}$/.test(v.playbackId)) return null
  // TS1b: the MP4 the row plays (a sized one for a newer loop, 720p at most); only a name Mux makes is drawn.
  const mp4 = v.mp4 && /^(?:highest|\d{3,4}p)$/.test(v.mp4) ? v.mp4 : 'highest'
  return <video data-loop={`${MUX_STREAM_BASE}/${v.playbackId}/${mp4}.mp4`} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} disablePictureInPicture className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-base ease-standard" />
}

/**
 * A section with a loop and no photo of its own: the loop's first frame (Mux's still at 0 s, so the fade into the
 * loop is seamless) is the first paint, fetched first when it opens the page. Decorative: the heading says what it is.
 */
export function LoopPoster({ id, videos, lead, width }: { id: string | undefined; videos: LookVideos | undefined; lead: boolean; width: number }) {
  const v = id ? videos?.[id] : undefined
  if (!v || !/^[A-Za-z0-9]{1,64}$/.test(v.playbackId)) return null
  return <img src={`${MUX_IMAGE_BASE}/${v.playbackId}/thumbnail.webp?time=0&width=${width}`} alt="" width={v.width ?? undefined} height={v.height ?? undefined}
    fetchPriority={lead ? 'high' : 'auto'} loading={lead ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
}
