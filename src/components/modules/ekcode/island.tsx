'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { armFor } from '@/domains/ekcode-core/holdout'

// The holdout and the strip's loader, kept tiny (checkout's first-load budget). A random first-party id in this
// browser decides the arm (never a fingerprint); one beacon a day records the visit for the comparison; the strip
// loads only when this shop has a session (the shop_in hint) or the shopper just came back (#ek).
const ID = 'ek_v', SEEN = 'ek_seen'
const store = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* */ } } }

export function EkcodeIsland({ children, mark }: { children: ReactNode; mark: ReactNode }) {
  const [arm, setArm] = useState<'shown' | 'held' | null>(null)
  const [Strip, setStrip] = useState<null | ((p: { mark: ReactNode }) => ReactNode)>(null)
  useEffect(() => {
    let id = store.get(ID)
    if (!id) { const b = new Uint8Array(16); crypto.getRandomValues(b); id = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').slice(0, 22); store.set(ID, id) }
    const a = armFor(id)
    setArm(a); try { sessionStorage.setItem('shop:arm:ekcode', a) } catch { /* */ }
    const today = new Date().toISOString().slice(0, 10) // clock-ok: the browser's day, for a once-a-day beacon
    if (store.get(SEEN) !== today) { store.set(SEEN, today); navigator.sendBeacon?.('/api/shop/ekcode/seen', new Blob([JSON.stringify({ arm: a, visitor: id })], { type: 'application/json' })) }
    if (location.hash === '#ek' || document.cookie.includes('shop_in=1')) void import('./strip').then((m) => setStrip(() => m.Strip))
  }, [])
  if (Strip) return <Strip mark={mark} />
  if (arm !== 'shown') return null
  return <>{children}<p className="flex items-center gap-2.5 text-xs text-[var(--store-sub,currentColor)] before:h-px before:flex-1 before:bg-current before:opacity-20 after:h-px after:flex-1 after:bg-current after:opacity-20">or</p></>
}
