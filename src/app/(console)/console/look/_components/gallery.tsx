'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { ThemesLockup } from '@/components/brand/themes-lockup'
import { tryThemeAction } from '../actions'

export type GalleryTheme = {
  key: string; name: string; job: string; version: string; features: string[]; inUse: boolean; fits: number
  /** In use, on an older version than this one: Try moves the shop's look across whole (same theme). */
  newer?: boolean
  styles: { key: string; name: string; colour: string }[]; thumb: React.ReactNode
}

/** The five themes (mockup "Look" › Themes) and each one's details before trying it (mockup "Theme details"). */
export function Gallery({ themes, canEdit, sorted, draft = null }: { themes: GalleryTheme[]; canEdit: boolean; sorted: boolean
  /** The open draft's theme: trying another one replaces it, so that asks first (Look v3 § Confirmations). */
  draft?: { key: string; name: string } | null }) {
  const router = useRouter()
  const [open, setOpen] = useState<GalleryTheme | null>(null)
  const [pending, start] = useTransition()
  const toast = useToast()
  /** A refusal while the theme's details are open: that Dialog's error line (§ Feedback 4); after the confirm, a toast. */
  const [error, setError] = useState<string | null>(null)
  const [lost, setLost] = useState<string[]>([])
  const [confirmTry, setConfirmTry] = useState<GalleryTheme | null>(null)
  const askOrTry = (t: GalleryTheme) => { if (draft && draft.key !== t.key) { setOpen(null); setConfirmTry(t) } else tryIt(t, true) }
  const tryIt = (t: GalleryTheme, inDialog = false) => start(async () => {
    setError(null)
    const r = await tryThemeAction({ theme: t.key })
    if (!r.ok) { if (inDialog) setError(r.error); else toast.error(r.error); return }
    if (r.lost.length) { setLost(r.lost); return }
    router.push('/console/look/customize')
  })
  return (
    <section aria-labelledby="themes-h" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3"><h2 id="themes-h"><ThemesLockup /></h2>{sorted && <span className="text-sm text-muted-foreground">Good for what you sell first</span>}</div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => (
          <li key={t.key}>
            <Section flush ariaLabel={t.name} className={`relative transition-[translate,border-color] duration-base ease-standard hover:border-input [@media(hover:hover)]:hover:-translate-y-0.5 ${t.inUse ? 'ring-2 ring-foreground' : ''}`}>
              <div className="grid place-items-center bg-muted py-4">{t.thumb}</div>
              <div className="space-y-1.5 p-4">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setError(null); setLost([]); setOpen(t) }} className="text-left font-semibold underline-offset-4 after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring">{t.name}</button>
                  {t.inUse ? <Badge tone="ok">In use</Badge> : <Badge>Free</Badge>}{t.newer && <Badge tone="info">{t.version} is here</Badge>}<ThemesLockup size="sm" className="ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">{t.job}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">{t.styles.map((s) => <span key={s.key} title={s.name} className="size-3.5 rounded-full border border-border" style={{ background: s.colour }} />)}{t.styles.length} styles</p>
              </div>
            </Section>
          </li>
        ))}
        <li className="flex flex-col justify-center gap-2 rounded-lg border border-dashed border-input p-5 text-sm">
          <span className="font-semibold">Trying a theme changes nothing for shoppers</span>
          <span className="text-muted-foreground">It opens as a draft with your logo, photos and products. Publish when it looks right.</span>
          <span className="text-muted-foreground">All themes are free in every plan.</span>
        </li>
      </ul>
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} description={open?.job} error={error} className="md:w-[min(56rem,calc(100vw-2rem))]"
        actions={open ? <>
          <Button variant="secondary" className="after:hidden" data-autofocus onClick={() => setOpen(null)}>Not now</Button>
          {canEdit && (!open.inUse || open.newer) && (lost.length ? <Button onClick={() => router.push('/console/look/customize')}>Open the draft</Button> : <Button disabled={pending} onClick={() => askOrTry(open)}>{open.newer ? `Try ${open.name} ${open.version} in a draft` : `Try ${open.name} in a draft`}</Button>)}
        </> : null}>
        {open ? (
          <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)_14rem]">
            <div className="hidden place-items-center self-start rounded-lg bg-muted p-3 md:grid">{open.thumb}</div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">What it has</h3>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">{open.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden="true" className="text-ok-text">✓</span>{f}</li>)}</ul>
              {lost.length > 0 && <div role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text"><p className="font-medium">Your draft is on {open.name}. Not carried across:</p><ul className="list-disc pl-5">{lost.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            </div>
            <div className="space-y-3 rounded-lg bg-muted p-4 text-sm">
              <Badge>Free</Badge>
              <div><p className="text-muted-foreground">Styles</p><ul className="mt-1 space-y-1">{open.styles.map((s) => <li key={s.key} className="flex items-center gap-2"><span className="size-4 rounded-full border border-border" style={{ background: s.colour }} />{s.name}</li>)}</ul></div>
              <ThemesLockup size="sm" /><p><span className="text-muted-foreground">Version</span> {open.version}</p>
              <p className="text-muted-foreground">Opens as a draft with your logo, photos and products. Shoppers see nothing until you publish.</p>
            </div>
          </div>
        ) : null}
      </Dialog>
      <Dialog open={!!confirmTry} onClose={() => setConfirmTry(null)} title={`Try ${confirmTry?.name ?? ''}?`} description={`Your ${draft?.name ?? ''} draft is replaced. Your shop doesn’t change.`}
        actions={<><Button variant="secondary" className="after:hidden" data-autofocus onClick={() => setConfirmTry(null)}>Keep my draft</Button><Button disabled={pending} onClick={() => { const t = confirmTry!; setConfirmTry(null); tryIt(t) }}>Try {confirmTry?.name}</Button></>} />
    </section>
  )
}
