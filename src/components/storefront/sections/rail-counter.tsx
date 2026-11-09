'use client'

import { useEffect, useRef } from 'react'

/** "01 / 10" and a progress line under a swipe row (theme Signal): the server writes the start, this follows the scroll.
 *  The one island Signal adds (speed review: ≤ 1 kB); no state, a passive scroll listener on the row it names. */
export function RailCounter({ rail, total }: { rail: string; total: number }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const row = document.getElementById(rail), out = ref.current
    if (!row || !out) return
    const two = (n: number) => String(n).padStart(2, '0')
    const on = () => {
      const max = row.scrollWidth - row.clientWidth
      const at = max > 0 ? row.scrollLeft / max : 0
      const n = Math.min(total, Math.max(1, Math.round(at * (total - 1)) + 1))
      out.style.setProperty('--at', String(max > 0 ? at : 1))
      const t = out.querySelector('span'); if (t) t.textContent = `${two(n)} / ${two(total)}`
    }
    row.addEventListener('scroll', on, { passive: true }); on()
    return () => row.removeEventListener('scroll', on)
  }, [rail, total])
  return <p ref={ref} className="store-counter" aria-hidden="true"><i /><span>01 / {String(total).padStart(2, '0')}</span></p>
}
