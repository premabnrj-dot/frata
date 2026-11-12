'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { Section } from '@/components/layout/section'
import { button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { DOC_LOGO_PX, MAX_DOC_IMAGE_BYTES, MAX_SOURCE_BYTES } from '@/domains/media/sizes'
import { setDocLogo } from '../actions'

// The logo for paper (Settings › Documents, D2). React-PDF reads PNG or JPEG only, so the browser redraws the chosen
// file as a PNG (at most 600 px a side, transparency kept) and uploads that to the shop's documents folder; the
// server checks its bytes before it is set. An invoice keeps the logo it was packed with.

async function toPng(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP image.')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That image is over 25 MB.')
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('That image could not be read. Save it as PNG and try again.') })
  const scale = Math.min(1, DOC_LOGO_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('This browser could not make the PNG. Try Chrome.')
  if (blob.size > MAX_DOC_IMAGE_BYTES) throw new Error('That logo is too detailed for 1 MB. Try a simpler file.')
  return blob
}

export function DocLogo({ tenantId, current }: { tenantId: string; current: string | null }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const toast = useToast()

  const choose = (file: File | undefined) => {
    if (!file) return
    start(async () => {
      try {
        const png = await toPng(file)
        const res = await upload(`tenants/${tenantId}/documents/${crypto.randomUUID()}.png`, png, { access: 'public', handleUploadUrl: '/api/console/upload', contentType: 'image/png' })
        const r = await setDocLogo(res.url)
        if (!r.ok) { toast.error(r.error); return }
        toast.ok('Logo saved. New slips and invoices use it.'); router.refresh()
      } catch (e) { toast.error(e instanceof Error ? e.message : 'That upload was refused.') }
    })
  }
  const remove = () => start(async () => {
    const r = await setDocLogo(null)
    if (!r.ok) toast.error(r.error)
    else { toast.ok('Logo removed. Documents show your shop’s initial.'); router.refresh() }
  })

  return (
    <Section>
      <h2 className="text-section font-semibold">Logo for paper</h2>
      <p className="-mt-1 text-sm text-muted-foreground">PNG or JPEG, shown at the top of each slip and invoice. Dark on white prints best.</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own Blob file, shown as it will print */}
          {current ? <img src={current} alt="Logo for paper" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo: your initial</span>}
        </div>
        <label className={button({ variant: 'secondary' })}>
          {busy ? 'Saving…' : current ? 'Replace' : 'Upload logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {current && <button type="button" className={button({ variant: 'ghost' })} disabled={busy} onClick={remove}>Remove</button>}
      </div>
    </Section>
  )
}
