'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { EK } from '@/domains/ekcode-core/brand'

// The signed-in strip (its own chunk): fills the checkout through a generic 'shop:prefill' event (core never imports
// this module), shows "Not you?", and — ticked by default for a new address (owner, 2026-11-09) — saves the address
// to EkCode after the order through 'shop:placed'.
type Me = { signedIn: boolean; name?: string; phone?: string; address?: Record<string, string> | null; addressLabel?: string | null; canSave?: boolean }

export function Strip({ mark }: { mark: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [save, setSave] = useState(true)
  useEffect(() => {
    void fetch('/api/shop/ekcode/me', { cache: 'no-store' }).then((r) => r.json()).then((m: Me) => {
      setMe(m)
      if (m.signedIn) window.dispatchEvent(new CustomEvent('shop:prefill', { detail: { name: m.name, phone: m.phone, ...(m.address ?? {}) } }))
    }).catch(() => setMe({ signedIn: false }))
  }, [])
  useEffect(() => {
    if (!me?.signedIn || me.address || !me.canSave || !save) return
    const onPlaced = (e: Event) => {
      const a = (e as CustomEvent<Record<string, string>>).detail
      void fetch('/api/shop/ekcode/save', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Home', address: a }) })
    }
    window.addEventListener('shop:placed', onPlaced)
    return () => window.removeEventListener('shop:placed', onPlaced)
  }, [me, save])
  if (!me?.signedIn) return null
  const notYou = async () => { await fetch('/api/shop/ekcode/me', { method: 'POST' }); location.replace('/checkout') }
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 rounded-[10px] border border-current/15 px-3 py-2.5 text-sm">
        <span className="flex min-w-0 items-center gap-2">{mark}<span className="truncate">{me.name}</span></span>
        <button type="button" className="underline underline-offset-2" onClick={() => void notYou()}>{EK.shop.notYou}</button>
      </div>
      {!me.address && me.canSave && (
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-store-ink" checked={save} onChange={(e) => setSave(e.target.checked)} />
          <span>{EK.shop.saveAddress} EkCode</span>
        </label>
      )}
    </div>
  )
}
