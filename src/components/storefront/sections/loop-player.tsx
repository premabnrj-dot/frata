'use client'

import { useEffect } from 'react'

/** A loop loads only once half of it has stayed in view this long (owner 2026-11-11: Frrata pays Mux per minute
 *  played, so a scroll past costs nothing). */
const DWELL_MS = 400

/**
 * The one island for every loop on a page (V1; rendered by the Home page and the preview only, so no other shop page
 * carries it): a loop gets its source and plays only after half of it has been in view for DWELL_MS,
 * one at a time, paused out of view; it fades in once it is really playing. Reduced motion or a data saver: the
 * photos stay, nothing loads.
 */
export function LoopPlayer() {
  useEffect(() => {
    const all = [...document.querySelectorAll<HTMLVideoElement>('video[data-loop]')]
    if (!all.length || matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return
    let on: HTMLVideoElement | null = null
    const waits = new Map<HTMLVideoElement, ReturnType<typeof setTimeout>>()
    const play = (v: HTMLVideoElement) => {
      waits.delete(v)
      if (on && on !== v) on.pause()
      if (!v.src) v.src = v.dataset.loop!
      on = v
      v.play().catch(() => {})
    }
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const v = e.target as HTMLVideoElement
        if (e.intersectionRatio >= 0.5) {
          // Already loaded: play at once; not yet: only after the dwell (a scroll past loads nothing).
          if (v.src) play(v)
          else if (!waits.has(v)) waits.set(v, setTimeout(() => play(v), DWELL_MS))
        } else {
          clearTimeout(waits.get(v)); waits.delete(v)
          v.pause(); if (on === v) on = null
        }
      }
    }, { threshold: [0, 0.5] })
    for (const v of all) { v.addEventListener('playing', () => v.classList.remove('opacity-0'), { once: true }); io.observe(v) }
    return () => { io.disconnect(); for (const t of waits.values()) clearTimeout(t) }
  }, [])
  return null
}
