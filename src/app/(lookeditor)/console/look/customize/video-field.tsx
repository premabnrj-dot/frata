'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@/components/icons/icon'
import { MAX_LOOP_MS, uploadProblem } from '@/domains/video/state'
import { cancelVideoUploadAction, startVideoUploadAction, videoStatusAction, type VideoStatus } from '@/app/(console)/console/look/video-actions'

// =============================================================================
// FILE: video-field.tsx — a section's loop (V1; mockup board "Video", owner-approved 2026-11-09): Add a video →
// Uploading (progress, Cancel) → Getting it ready → Ready (poster, length, Replace, Remove); Didn't work (Choose
// another). The file goes from the browser straight to Mux. Replace and Remove change the draft only; the video is
// deleted when no look uses it (at publish or discard).
// =============================================================================

const secs = (ms: number) => `0:${String(Math.round(ms / 1000)).padStart(2, '0')}`

export function VideoField({ value, onChange, on }: { value: { id: string } | undefined; onChange: (v: { id: string } | undefined) => void
  /** Mux is set up for shops (the server knows; a preview without it says so). */
  on: boolean }) {
  const id = useId()
  const [progress, setProgress] = useState<number | null>(null)
  const [status, setStatus] = useState<VideoStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const xhr = useRef<XMLHttpRequest | null>(null)

  // While a video is getting ready, ask again: 2, 4, 8 … 30 s; stop once it plays, failed or is gone.
  // Keyed on the id (a rebuilt section object doesn't restart it); five failed asks in a row stop it (a lost session).
  const videoId = value?.id
  useEffect(() => {
    if (!videoId || progress !== null) return
    let wait = 2000, stop = false, misses = 0, timer: ReturnType<typeof setTimeout> | undefined
    const ask = async () => {
      const r = await videoStatusAction({ id: videoId }).catch(() => null)
      if (stop) return
      if (r?.ok) { setStatus(r.status); misses = 0 } else misses++
      const k = r?.ok ? r.status?.kind : null
      if ((k === 'uploading' || k === 'preparing' || !r?.ok) && misses < 5) { timer = setTimeout(ask, wait); wait = Math.min(wait * 2, 30_000) }
    }
    void ask()
    return () => { stop = true; clearTimeout(timer) }
  }, [videoId, progress])

  const pick = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    const why = uploadProblem(f.type, f.size)
    if (why) { setError(why); return }
    const r = await startVideoUploadAction({ contentType: f.type, size: f.size })
    if (!r.ok) { setError(r.error); return }
    setStatus(null); setProgress(0)
    onChange({ id: r.videoId })
    const x = new XMLHttpRequest(); xhr.current = x
    x.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(e.loaded / e.total) }
    x.onload = () => { xhr.current = null; setProgress(null); if (x.status >= 300) setError('The video didn’t upload. Try again.') }
    x.onerror = () => { xhr.current = null; setProgress(null); setError('The video didn’t upload. Check your connection and try again.') }
    x.open('PUT', r.url); x.setRequestHeader('content-type', f.type); x.send(f)
  }
  const cancel = async () => {
    xhr.current?.abort(); xhr.current = null; setProgress(null)
    if (value) await cancelVideoUploadAction({ id: value.id }).catch(() => null)
    onChange(undefined); setStatus(null)
  }
  const input = <input id={id} type="file" accept="video/mp4,video/quicktime" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />

  if (!on) return <div className="space-y-1"><p className="text-sm font-medium">Video</p><p className="text-sm text-muted-foreground">Video isn’t switched on for shops yet.</p></div>
  const k = progress !== null ? 'sending' : !value ? 'none' : status?.kind ?? 'uploading'
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium">Video <span className="font-normal text-muted-foreground">(optional, plays over the photo)</span></p>
      {k === 'none' || k === 'removed' ? (
        <label htmlFor={id} tabIndex={0} className="grid min-h-24 cursor-pointer place-items-center gap-1 rounded-xl border-[1.5px] border-dashed border-input p-4 text-center transition-[border-color] duration-base ease-standard hover:border-foreground">
          <Icon name="upload" className="size-6 text-muted-foreground" />
          <span className="font-medium">Add a video</span>
          <span className="text-xs text-muted-foreground">MP4 or MOV, up to {MAX_LOOP_MS / 1000} seconds</span>
        </label>
      ) : k === 'sending' ? (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm">
          <span className="font-mono font-semibold tabular-nums">{Math.round((progress ?? 0) * 100)}%</span>
          <span className="flex-1">Uploading</span>
          <button type="button" onClick={() => void cancel()} className="font-medium underline underline-offset-4">Cancel</button>
        </div>
      ) : k === 'uploading' || k === 'preparing' ? (
        <div role="status" className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-foreground" />
          <span className="flex-1">Getting it ready</span>
          <button type="button" onClick={() => void cancel()} className="font-medium underline underline-offset-4">Cancel</button>
        </div>
      ) : k === 'playable' ? (
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
          {status?.poster && <img src={status.poster} alt="" className="size-full object-cover" />}
          {status?.durationMs != null && <span className="absolute bottom-2 left-2 rounded-md bg-card/95 px-1.5 py-0.5 font-mono text-xs">{secs(status.durationMs)}</span>}
          <span className="absolute right-2 top-2 flex gap-1">
            <label htmlFor={id} className="grid size-8 cursor-pointer place-items-center rounded-lg bg-card/95 text-foreground shadow-sm" title="Replace"><Icon name="upload" className="size-4" /><span className="sr-only">Replace video</span></label>
            <button type="button" onClick={() => { onChange(undefined); setStatus(null) }} className="grid size-8 place-items-center rounded-lg bg-card/95 text-foreground shadow-sm" title="Remove"><Icon name="close" className="size-3.5" /><span className="sr-only">Remove video</span></button>
          </span>
        </div>
      ) : (
        <div role="alert" className="space-y-2 rounded-xl border border-danger-text/40 bg-danger p-3 text-sm text-danger-text">
          <p>{status?.tooLong ? `Didn’t work: it’s longer than ${MAX_LOOP_MS / 1000} seconds.` : 'Didn’t work.'}</p>
          <label htmlFor={id} className="cursor-pointer font-medium underline underline-offset-4">Choose another</label>
        </div>
      )}
      {input}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
    </div>
  )
}
