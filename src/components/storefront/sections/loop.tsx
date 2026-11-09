import { MUX_STREAM_BASE } from '@/lib/env'
import type { LookVideos } from '@/lib/themes/page-look'

/**
 * V1: a section's muted loop, laid over its photo (the photo is the first paint and stays the fallback). No source
 * until the player island sees it in view (preload none: a loop costs Frrata per minute delivered); hidden from
 * assistive tech (it is decoration; the photo carries the alt text). A playback id that isn't Mux's shape is not drawn.
 */
export function Loop({ id, videos }: { id: string | undefined; videos: LookVideos | undefined }) {
  const v = id ? videos?.[id] : undefined
  if (!v || !/^[A-Za-z0-9]{1,64}$/.test(v.playbackId)) return null
  return <video data-loop={`${MUX_STREAM_BASE}/${v.playbackId}/highest.mp4`} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} disablePictureInPicture className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-base ease-standard" />
}
