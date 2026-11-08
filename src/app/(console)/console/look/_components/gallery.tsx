'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { tryThemeAction } from '../actions'

export type GalleryTheme = {
  key: string; name: string; job: string; version: string; features: string[]; inUse: boolean; fits: number
  styles: { key: string; name: string; colour: string }[]; thumb: React.ReactNode
}

/** The five themes (mockup "Look" › Themes) and each one's details before trying it (mockup "Theme details"). */
export function Gallery({ themes, canEdit, sorted }: { themes: GalleryTheme[]; canEdit: boolean; sorted: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState<GalleryTheme | null>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [lost, setLost] = useState<string[]>([])
  const tryIt = (t: GalleryTheme) => start(async () => {
    setError(null)
    const r = await tryThemeAction({ theme: t.key })
    if (!r.ok) { setError(r.error); return }
    if (r.lost.length) { setLost(r.lost); return }
    router.push('/console/look/customize')
  })
  return (
    <section aria-labelledby="themes-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2"><h2 id="themes-h" className="text-section font-semibold">Themes</h2>{sorted && <span className="text-sm text-muted-foreground">Good for what you sell first</span>}</div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => (
          <li key={t.key}>
            <Section flush ariaLabel={t.name} className={t.inUse ? 'ring-2 ring-foreground' : ''}>
              <div className="grid place-items-center bg-muted py-4">{t.thumb}</div>
              <div className="space-y-1.5 p-4">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { setError(null); setLost([]); setOpen(t) }} className="text-left font-semibold underline-offset-4 hover:underline">{t.name}</button>
                  {t.inUse ? <Badge tone="ok">In use</Badge> : <Badge>Free</Badge>}
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
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} description={open?.job}
        actions={open ? <>
          <Button variant="secondary" className="after:hidden" data-autofocus onClick={() => setOpen(null)}>Not now</Button>
          {canEdit && !open.inUse && (lost.length ? <Button onClick={() => router.push('/console/look/customize')}>Open the draft</Button> : <Button disabled={pending} onClick={() => tryIt(open)}>Try {open.name} in a draft</Button>)}
        </> : null}>
        {open ? (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">What it has</h3>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">{open.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden="true" className="text-ok-text">✓</span>{f}</li>)}</ul>
              {lost.length > 0 && <div role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text"><p className="font-medium">Your draft is on {open.name}. Not carried across:</p><ul className="list-disc pl-5">{lost.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
            </div>
            <div className="space-y-3 rounded-lg bg-muted p-4 text-sm">
              <Badge>Free</Badge>
              <div><p className="text-muted-foreground">Styles</p><ul className="mt-1 space-y-1">{open.styles.map((s) => <li key={s.key} className="flex items-center gap-2"><span className="size-4 rounded-full border border-border" style={{ background: s.colour }} />{s.name}</li>)}</ul></div>
              <p><span className="text-muted-foreground">Version</span> {open.version} · by Frrata</p>
              <p className="text-muted-foreground">Opens as a draft with your logo, photos and products. Shoppers see nothing until you publish.</p>
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  )
}
