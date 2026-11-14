'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/icons/icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { Section } from '@/components/layout/section'
import { failedWords, uploadProblem, USE_LIMITS } from '@/domains/video/state'
import type { ProductVideoView } from '@/lib/video/product-view'
import { productVideoStatusAction, removeProductVideoAction, setProductVideoAction, startProductVideoAction } from '../video-actions'

// =============================================================================
// FILE: video-panel.tsx — a product's video (PV·1; mockup docs/mockups/2026-11-09-product-video.html, Console view):
// Add a video → Uploading (progress, Cancel) → Getting it ready → Ready (the frame, shape and length, where it shows,
// the cover-frame strip, the button's words, Replace, Remove); Didn't work (why, Choose another). The file goes from
// the browser straight to Mux. Saves as it changes (it is a file, not a form field), like Photos. A file refused, an
// upload or a change that failed is an error toast; Remove's own failure stays in its dialog (§ Feedback 1, 4).
// =============================================================================

const BUTTON_WORDS = [['model', 'See it on a model'], ['wear', 'How to wear'], ['none', 'None']] as const
const LIMIT = USE_LIMITS.product

/** The length the browser reads from the file, or null when it can't (a codec it doesn't play): the server checks too. */
function lengthOf(f: File): Promise<number | null> {
  return new Promise((done) => {
    const v = document.createElement('video'), url = URL.createObjectURL(f)
    const end = (ms: number | null) => { clearTimeout(t); URL.revokeObjectURL(url); v.removeAttribute('src'); done(ms) }
    const t = setTimeout(() => end(null), 4000)
    v.preload = 'metadata'; v.muted = true
    v.onloadedmetadata = () => end(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : null)
    v.onerror = () => end(null)
    v.src = url
  })
}

export function VideoPanel({ productId, initial, blocked, title, onShop }: { productId: string; initial: ProductVideoView | null
  /** Whether the shop shows product video yet (PV1-4). */
  onShop: boolean
  /** Why this shop can't add a video now (the module's words; `apps` when switching it on in Apps is the way on), or
   *  null. A video it has can still be removed. */
  blocked: { words: string; apps: boolean } | null; title: string }) {
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [video, setVideo] = useState(initial)
  const [progress, setProgress] = useState<number | null>(null)
  const toast = useToast()
  const [ask, setAsk] = useState<'replace' | 'remove' | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const xhr = useRef<XMLHttpRequest | null>(null)

  // While it is getting ready, ask again: 2, 4, 8 … 30 s; stop once it plays, failed or is gone; five misses stop it.
  const waiting = progress === null && (video?.kind === 'uploading' || video?.kind === 'preparing')
  const vid = video?.id
  useEffect(() => {
    if (!waiting) return
    let wait = 2000, stop = false, misses = 0, timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      const r = await productVideoStatusAction({ productId }).catch(() => null)
      if (stop) return
      if (r?.ok) { misses = 0; setVideo(r.video) } else misses++
      const k = r?.ok ? r.video?.kind : null
      if ((k === 'uploading' || k === 'preparing' || !r?.ok) && misses < 5) { timer = setTimeout(poll, wait); wait = Math.min(wait * 2, 30_000) }
    }
    timer = setTimeout(poll, 1000)
    return () => { stop = true; clearTimeout(timer) }
  }, [waiting, vid, productId])

  const pick = async (f: File | undefined) => {
    if (!f) return
    const why = uploadProblem(f.type, f.size, 'product')
    if (why) { toast.error(why); return }
    // Too long is refused before a byte leaves the phone (the cost is in the file); too short is cheap, the server checks.
    const ms = await lengthOf(f)
    if (ms !== null && ms > LIMIT.maxMs + 500) { toast.error(failedWords('too_long', ms, null, null)); return }
    setBusy(true)
    const r = await startProductVideoAction({ productId, contentType: f.type, size: f.size, ...(video ? { replaces: video.id } : {}) }).catch(() => null)
    setBusy(false)
    if (!r?.ok) { toast.error(r?.error ?? 'Video didn’t start. Try again in a minute.'); return }
    setVideo({ id: r.videoId, kind: 'uploading', failed: null, shape: null, size: null, length: null, posterMs: 1000, button: 'model', poster: null, frames: [] })
    setProgress(0)
    const x = new XMLHttpRequest(); xhr.current = x
    x.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(e.loaded / e.total) }
    x.onload = () => { xhr.current = null; setProgress(null); if (x.status >= 300) toast.error('The video didn’t upload. Try again.') }
    x.onerror = () => { xhr.current = null; setProgress(null); toast.error('The video didn’t upload. Check your connection and try again.') }
    x.open('PUT', r.url); x.setRequestHeader('content-type', f.type); x.send(f)
  }

  const remove = async () => {
    xhr.current?.abort(); xhr.current = null; setProgress(null)
    const inDialog = ask === 'remove'
    setBusy(true); setRemoveError(null)
    const r = await removeProductVideoAction({ productId }).catch(() => null)
    setBusy(false)
    if (!r?.ok) {
      const why = r?.error ?? 'The video wasn’t removed. Try again.'
      if (inDialog) setRemoveError(why); else toast.error(why)
      return
    }
    setAsk(null); setVideo(null)
  }

  const set = async (change: { posterMs?: number; button?: 'model' | 'wear' | 'none' }) => {
    if (!video) return
    const before = video
    setVideo({ ...video, ...change, poster: change.posterMs !== undefined ? video.frames.find((f) => f.ms === change.posterMs)?.poster ?? video.poster : video.poster })
    const r = await setProductVideoAction({ productId, ...change }).catch(() => null)
    if (!r?.ok) { setVideo(before); toast.error(r?.error ?? 'Not saved. Try again.') }
  }

  const k = progress !== null ? 'sending' : video?.kind ?? 'none'
  const badge = k === 'playable' ? <Badge tone="ok">Ready</Badge> : k === 'failed' ? <Badge tone="danger">Didn’t work</Badge>
    : k === 'sending' || k === 'uploading' ? <Badge tone="info">Uploading</Badge> : k === 'preparing' ? <Badge tone="info">Getting it ready</Badge> : null
  const reel = video?.shape?.startsWith('Reel')
  // The cover is the frame nearest the saved time (the default, 1 s, sits between the strip's frames on a long video).
  const chosen = video?.frames.length ? video.frames.reduce((a, f) => (Math.abs(f.ms - video.posterMs) < Math.abs(a.ms - video.posterMs) ? f : a)).ms : null

  return (
    <Section id="video" title="Video" action={badge}>
      {k === 'none' ? (
        blocked ? <p className="text-sm text-muted-foreground">{blocked.apps ? <Link href="/console/apps" className="font-medium text-foreground underline underline-offset-4">{blocked.words}</Link> : blocked.words}</p> : (
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="grid min-h-24 w-full cursor-pointer place-items-center gap-1 rounded-md border border-dashed border-input p-4 text-center transition-colors duration-fast ease-standard hover:bg-accent">
            <Icon name="video" className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">Add a video</span>
            <span className="text-xs text-muted-foreground">MP4 or MOV · 0:06 to 1:00 · a reel or a film</span>
          </button>
        )
      ) : k === 'sending' ? (
        <div role="status" className="space-y-2 rounded-md bg-muted p-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="font-num font-semibold">{Math.round((progress ?? 0) * 100)}%</span>
            <span className="flex-1">Uploading</span>
            <button type="button" disabled={busy} onClick={() => void remove()} className="font-medium underline underline-offset-4">Cancel</button>
          </div>
          <span className="block h-1 overflow-hidden rounded-full bg-card"><span className="block h-full w-full origin-left bg-foreground" style={{ transform: `scaleX(${progress ?? 0})` }} /></span>
        </div>
      ) : k === 'uploading' || k === 'preparing' ? (
        <div role="status" className="flex items-center gap-3 rounded-md bg-muted p-3 text-sm">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-foreground" />
          <span className="flex-1">Getting it ready</span>
          <button type="button" disabled={busy} onClick={() => void remove()} className="font-medium underline underline-offset-4">Cancel</button>
        </div>
      ) : k === 'failed' ? (
        // feedback-ok: the video's Didn't work STATE (found by polling), with what to do (Choose another, Remove) — rule 5
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-danger-text/40 bg-danger p-3 text-sm text-danger-text">
          <span className="flex-1">{video?.failed}</span>
          {blocked ? null : <button type="button" disabled={busy} onClick={() => input.current?.click()} className="font-medium underline underline-offset-4">Choose another</button>}
          <button type="button" disabled={busy} onClick={() => void remove()} className="font-medium underline underline-offset-4">Remove</button>
        </div>
      ) : video && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
          <div className={`relative overflow-hidden rounded-md bg-muted ${reel ? 'aspect-[9/16] max-w-[200px]' : 'aspect-video'}`}>
            {video.poster && <img src={video.poster} alt="" className="size-full object-cover" />}
            <span aria-hidden="true" className="absolute inset-0 grid place-items-center"><span className="grid size-10 place-items-center rounded-full bg-card/90 text-foreground"><Icon name="play" className="size-5" /></span></span>
            {video.length && <span className="absolute bottom-2 left-2 rounded-sm bg-card/95 px-1.5 py-0.5 font-num text-xs">{video.length}</span>}
          </div>
          <div className="grid content-start gap-3">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Shape</dt><dd>{video.shape}{video.size && <span className="text-muted-foreground"> · {video.size}</span>}</dd>
              <dt className="text-muted-foreground">Length</dt><dd className="font-num">{video.length}</dd>
              <dt className="text-muted-foreground">Shows</dt><dd>{onShop ? <>Second in the photos{video.button !== 'none' && ' · beside the sizes'}</> : 'Not on your shop yet'}</dd>
            </dl>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium" id={`${inputId}-frames`}>Cover frame</span>
              <div role="group" aria-labelledby={`${inputId}-frames`} className="flex gap-1 overflow-x-auto pb-1">
                {video.frames.map((f) => (
                  <button key={f.ms} type="button" aria-pressed={f.ms === chosen} aria-label={`Frame at ${f.ms / 1000} seconds`} onClick={() => void set({ posterMs: f.ms })}
                    className={`shrink-0 overflow-hidden rounded-sm border-2 ${reel ? 'aspect-[9/16] w-11' : 'aspect-video w-20'} ${f.ms === chosen ? 'border-foreground' : 'border-transparent'}`}>
                    <img src={f.url} alt="" loading="lazy" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium" id={`${inputId}-words`}>Button beside the sizes</span>
              <div role="group" aria-labelledby={`${inputId}-words`} className="inline-flex w-fit flex-wrap rounded-md border border-input p-0.5">
                {BUTTON_WORDS.map(([v, words]) => (
                  <button key={v} type="button" aria-pressed={video.button === v} onClick={() => { if (video.button !== v) void set({ button: v }) }}
                    className={`rounded-sm px-2.5 py-1 text-sm transition-colors duration-fast ease-standard ${video.button === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{words}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!blocked && <Button variant="secondary" disabled={busy} onClick={() => setAsk('replace')}>Replace</Button>}
              <Button variant="secondary" disabled={busy} onClick={() => setAsk('remove')}>Remove</Button>
            </div>
          </div>
        </div>
      )}
      {/* Opened by the buttons above (Add a video, Choose another, Replace), so it is not a control of its own. */}
      <input ref={input} type="file" accept="video/mp4,video/quicktime" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={busy || (!!blocked && !video)}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      <Dialog open={ask === 'remove'} onClose={() => { setAsk(null); setRemoveError(null) }} title="Remove the video?" description={`It comes off ${title} at once and is deleted.`} error={removeError}
        actions={<><Button variant="secondary" data-autofocus onClick={() => { setAsk(null); setRemoveError(null) }}>Keep the video</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>Remove video</Button></>} />
      <Dialog open={ask === 'replace'} onClose={() => setAsk(null)} title="Replace the video?" description="The one on the product now is deleted when the new one starts uploading."
        actions={<><Button variant="secondary" data-autofocus onClick={() => setAsk(null)}>Keep the video</Button><Button onClick={() => { setAsk(null); input.current?.click() }}>Choose a video</Button></>} />
    </Section>
  )
}
