'use client'

import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons/icon'
import { Spinner } from '@/components/ui/button'
import { Tag } from '@/components/ui/badge'
import { Segmented } from '@/components/ui/segmented'
import { ICON_BUTTON } from '@/components/ui/panel-rail'
import { FIELD } from '@/components/ui/field'
import { WIDTHS, previewScale, type PreviewWidth } from '@/domains/studio/layout'
import { cn } from '@/lib/utils'
import { BUILDING, CASES, PAGES, PREVIEWING, type Case, type Part } from './fixtures'
import { FixtureSite } from './site'

// The preview (mockup screen 1 `.canvas`): its bar (page, case, width, what is building, the version shown, open in a
// new tab, Preview only) and the stage, where the store is drawn at a shopper's width and scaled down to fit. A phone
// offers its own width only, and no Preview only (one region at a time already).

export function Preview({ phone, previewOnly, onPreviewOnly, picked, onPick }: {
  phone: boolean; previewOnly: boolean; onPreviewOnly: () => void; picked: Part | null; onPick: (p: Part) => void
}) {
  const [page, setPage] = useState<string>(PAGES[0])
  const [shown, setShown] = useState<Case>('normal')
  const [width, setWidth] = useState<PreviewWidth>(390)
  const stage = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState(0)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const o = new ResizeObserver(([e]) => setRoom(Math.floor(e!.contentRect.width)))
    o.observe(el)
    return () => o.disconnect()
  }, [])
  const w: PreviewWidth = phone ? 390 : width
  const scale = previewScale(room, w)
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-2 py-1.5">
        <select aria-label="Page" value={page} onChange={(e) => setPage(e.target.value)} className={cn(FIELD, 'shrink-0')}>
          {PAGES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select aria-label="Case" value={shown} onChange={(e) => setShown(e.target.value as Case)} className={cn(FIELD, 'shrink-0')}>
          {CASES.map(([v, words]) => <option key={v} value={v}>{words}</option>)}
        </select>
        <Segmented label="Width" value={String(w)} onPick={(v) => setWidth(Number(v) as PreviewWidth)} className="shrink-0 flex-nowrap"
          options={(phone ? [390] : WIDTHS).map((x) => [String(x), String(x)] as const)} />
        {phone ? null : <span className="ml-auto flex min-w-0 items-center gap-1.5 text-small whitespace-nowrap text-muted-foreground"><Spinner className="size-3 shrink-0" /><span className="truncate">Building {BUILDING} · about 1–2 min</span></span>}
        <Tag className={cn('shrink-0', phone && 'ml-auto')}>Preview · {PREVIEWING}</Tag>
        <button type="button" aria-label="Open preview in a new tab" className={ICON_BUTTON}><Icon name="external" className="size-4" /></button>
        {phone ? null : <button type="button" aria-label="Preview only" aria-pressed={previewOnly} onClick={onPreviewOnly} className={ICON_BUTTON}><Icon name="focus" className="size-4" /></button>}
      </div>
      <div ref={stage} className="min-h-0 overflow-auto p-5">
        <div data-device={w} style={{ width: w, zoom: scale, '--pick': 'var(--ring)' } as React.CSSProperties} className="mx-auto overflow-hidden rounded-lg border border-border shadow-md">
          <FixtureSite shown={shown} picked={picked} onPick={onPick} />
        </div>
      </div>
    </>
  )
}
