'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Section } from '@/components/layout/section'
import { button } from '@/components/ui/button'
import { setShopLogo } from '../actions'

/** The shop's logo (Settings › Brand; search and sharing S1·6): the shop's header, its tab icon and its markup. */
export function ShopLogo({ tenantId, current }: { tenantId: string; current: string | null }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const choose = (file: File | undefined) => {
    if (!file) return
    setError(null); setNote(null)
    start(async () => {
      try {
        const { uploadPhoto } = await import('../../products/_components/upload-photos')
        const up = await uploadPhoto(file, tenantId, () => {}, 'brand')
        const r = await setShopLogo(up.base)
        if (!r.ok) { setError(r.error); return }
        setNote('Saved.'); router.refresh()
      } catch (e) { setError(e instanceof Error ? e.message : 'That upload was refused.') }
    })
  }
  const remove = () => start(async () => {
    setError(null)
    const r = await setShopLogo(null)
    if (!r.ok) setError(r.error); else { setNote('Removed.'); router.refresh() }
  })
  return (
    <Section>
      <h2 className="text-section font-semibold">Logo</h2>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-border bg-muted p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own Blob file, as the shop shows it */}
          {current ? <img src={current} alt="Shop logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">Your shop’s name</span>}
        </div>
        <label className={button({ variant: 'secondary' })}>
          {busy ? 'Saving…' : current ? 'Replace' : 'Upload logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {current && <button type="button" className={button({ variant: 'ghost' })} disabled={busy} onClick={remove}>Remove</button>}
      </div>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {note && <p role="status" className="text-sm text-ok-text">{note}</p>}
    </Section>
  )
}
