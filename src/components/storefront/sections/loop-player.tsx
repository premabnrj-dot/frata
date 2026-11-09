'use client'

import { useEffect } from 'react'

/**
 * The one island for every loop on a page (V1; rendered by the Home page and the preview only, so no other shop page
 * carries it): a loop gets its source and plays only while half of it is in view,
 * one at a time, paused out of view; it fades in once it is really playing. Reduced motion or a data saver: the
 * photos stay, nothing loads.
 */
export function LoopPlayer() {
  useEffect(() => {
    const all = [...document.querySelectorAll<HTMLVideoElement>('video[data-loop]')]
    if (!all.length || matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator as { connection?: { saveData?: boolean } }).connection?.saveData) return
    let on: HTMLVideoElement | null = null
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const v = e.target as HTMLVideoElement
        if (e.intersectionRatio >= 0.5) {
          if (on && on !== v) on.pause()
          if (!v.src) v.src = v.dataset.loop!
          on = v
          v.play().catch(() => {})
        } else { v.pause(); if (on === v) on = null }
      }
    }, { threshold: [0, 0.5] })
    for (const v of all) { v.addEventListener('playing', () => v.classList.remove('opacity-0'), { once: true }); io.observe(v) }
    return () => io.disconnect()
  }, [])
  return null
}
