'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { diffLayers } from '@/domains/themes/layer'
import { readinessOf, type ShopFacts } from '@/domains/themes/readiness'
import type { SectionInstance, SectionKey } from '@/domains/themes/sections'
import type { FooterVariant, HeaderVariant, Pairing, ThemeSettings } from '@/domains/themes/types'
import { publishLookAction, saveLookAction } from '@/app/(console)/console/look/actions'
import type { LinkTarget } from './controls'
import { SectionForm, type FormCtx } from './section-form'
import { SectionsPanel } from './sections-panel'
import { PageForm } from './page-form'
import { ThemeForm, type StyleOption } from './theme-form'

// =============================================================================
// The customizer (approved mockup "Customizer", "Customizer on a phone", "Publish"). One draft revision:
//   - every change is an undo step (50 kept) and an autosave 800 ms later, from the version the editor holds;
//     a stale save says who changed it (two editors) and stops autosaving until reload;
//   - the preview is the shop itself in an iframe (same origin only), refreshed after each save, the selected
//     section outlined in it;
//   - Publish lists what shoppers will see change and anything that blocks it (readiness), then offers Undo.
// =============================================================================

type Layer = { settings: ThemeSettings; home: SectionInstance[] }
export type EditorProps = {
  revisionId: string; version: number; themeName: string; style: string; layer: Layer
  styles: StyleOption[]; allowed: { pairings: Pairing[]; headers: HeaderVariant[]; footers: FooterVariant[]; sections: SectionKey[] }
  live: { theme: string; style: string; settings: Partial<ThemeSettings>; home: SectionInstance[] } | null
  facts: ShopFacts; formCtx: FormCtx; targets: LinkTarget[]; fonts: Record<Pairing, string>
  canPublish: boolean; shopOpen: boolean; nowIso: string; firstProduct: string | null; firstCollection: string | null
}

const DEVICES = { phone: { w: 390, h: 780 }, tablet: { w: 768, h: 1024 }, desktop: { w: 1280, h: 800 } } as const
type Device = keyof typeof DEVICES
type Status = 'saved' | 'saving' | { error: string }

export function Editor(p: EditorProps) {
  const router = useRouter()
  const now = useMemo(() => new Date(p.nowIso), [p.nowIso])
  const [layer, setLayer] = useState<Layer>(p.layer)
  const [style, setStyle] = useState(p.style)
  const [past, setPast] = useState<{ layer: Layer; style: string }[]>([])
  const [future, setFuture] = useState<{ layer: Layer; style: string }[]>([])
  const [tab, setTab] = useState<'sections' | 'theme'>('sections')
  const [selected, setSelected] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>('phone')
  const [page, setPage] = useState<'home' | 'product' | 'collection'>('home')
  const [status, setStatus] = useState<Status>('saved')
  const [publishing, setPublishing] = useState(false)
  const [pubError, setPubError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const version = useRef(p.version)
  const frame = useRef<HTMLIFrameElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ layer, style })
  latest.current = { layer, style }
  const stuck = typeof status === 'object' && /changed this draft|published|gone/.test(status.error)

  const post = (m: object) => frame.current?.contentWindow?.postMessage(m, window.location.origin)
  const save = useCallback(async () => {
    setStatus('saving')
    const { layer: l, style: s } = latest.current
    const r = await saveLookAction({ revisionId: p.revisionId, version: version.current, style: s, layer: l })
    if (!r.ok) { setStatus({ error: r.error }); return }
    version.current = r.version; setStatus('saved'); post({ type: 'refresh' })
  }, [p.revisionId])
  const schedule = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(save, 800) }

  const change = (next: Layer, nextStyle = style) => {
    if (stuck) return
    setPast((h) => [...h.slice(-49), { layer, style }]); setFuture([])
    setLayer(next); setStyle(nextStyle); schedule()
  }
  const undo = () => { const prev = past.at(-1); if (!prev || stuck) return; setPast((h) => h.slice(0, -1)); setFuture((f) => [{ layer, style }, ...f]); setLayer(prev.layer); setStyle(prev.style); schedule() }
  const redo = () => { const nxt = future[0]; if (!nxt || stuck) return; setFuture((f) => f.slice(1)); setPast((h) => [...h, { layer, style }]); setLayer(nxt.layer); setStyle(nxt.style); schedule() }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      e.preventDefault(); if (e.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  useEffect(() => { post({ type: 'select', sectionId: selected }) }, [selected])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const issues = useMemo(() => readinessOf(layer.home, p.facts, now), [layer.home, p.facts, now])
  const blocking = issues.filter((i) => i.blocks)
  const issueMap = new Map(issues.map((i) => [i.sectionId, i.text]))
  const styleName = p.styles.find((s) => s.key === style)?.name ?? style
  const changes = diffLayers(p.live, { theme: p.live?.theme ?? '', themeName: p.themeName, style, styleName, settings: layer.settings, home: layer.home })
  const sel = layer.home.find((s) => s.id === selected) ?? null
  const path = page === 'product' && p.firstProduct ? `/products/${p.firstProduct}` : page === 'collection' && p.firstCollection ? `/collections/${p.firstCollection}` : ''
  const d = DEVICES[device]

  const publish = () => start(async () => {
    setPubError(null)
    if (timer.current) { clearTimeout(timer.current); timer.current = null; await save() }
    const r = await publishLookAction({ revisionId: p.revisionId, version: version.current })
    // Success re-renders this page with no draft: it shows Published (with Undo) to the person who just published.
    if (!r.ok) setPubError(r.error)
  })

  const panel = (
    <div className="space-y-4">
      <div role="tablist" aria-label="Edit" className="flex gap-5 border-b border-border text-sm">
        {(['sections', 'theme'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`py-3 ${tab === t ? 'border-b-2 border-foreground font-semibold' : 'text-muted-foreground'}`}>{t === 'theme' ? 'Theme settings' : page === 'product' ? 'Product page' : page === 'collection' ? 'Collection page' : 'Sections'}</button>)}
      </div>
      {tab === 'sections' && page !== 'home' && <PageForm page={page} settings={layer.settings} set={(s) => change({ ...layer, settings: { ...layer.settings, ...s } })} />}
      {tab === 'sections' && page === 'home' && (sel ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setSelected(null)} className="text-sm text-muted-foreground">‹ Sections</button>
          <SectionForm s={sel} c={p.formCtx} set={(s) => change({ ...layer, home: layer.home.map((x) => (x.id === s.id ? s : x)) })} />
          {issueMap.has(sel.id) && <p role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text">{issueMap.get(sel.id)}</p>}
          <button type="button" onClick={() => { change({ ...layer, home: layer.home.filter((x) => x.id !== sel.id) }); setSelected(null) }} className="min-h-9 text-sm text-danger-text underline underline-offset-4">Remove this section</button>
        </div>
      ) : (
        <SectionsPanel home={layer.home} selected={selected} allowed={p.allowed.sections} issues={issueMap} now={now}
          onSelect={setSelected} onChange={(home, id) => { change({ ...layer, home }); if (id) setSelected(id) }} />
      ))}
      {tab === 'theme' && <ThemeForm settings={layer.settings} style={style} styles={p.styles} allowed={p.allowed} targets={p.targets} fonts={p.fonts}
        set={(s) => change({ ...layer, settings: { ...layer.settings, ...s } })} setStyle={(k) => change(layer, k)} />}
    </div>
  )

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2">
        <Link href="/console/look" className="min-h-10 content-center text-sm">‹ Look</Link>
        <span className="font-semibold">{p.themeName} · {styleName}</span><Badge tone="warn">Draft</Badge>
        <label className="sr-only" htmlFor="page-pick">Page</label>
        <select id="page-pick" value={page} onChange={(e) => setPage(e.target.value as typeof page)} className="hidden h-9 rounded-md border border-input bg-card px-2 text-sm md:block">
          <option value="home">Home</option>{p.firstProduct && <option value="product">A product</option>}{p.firstCollection && <option value="collection">A collection</option>}
        </select>
        <div role="group" aria-label="Preview size" className="hidden overflow-hidden rounded-md border border-input text-sm md:flex">
          {(Object.keys(DEVICES) as Device[]).map((k) => <button key={k} type="button" aria-pressed={device === k} onClick={() => setDevice(k)} className={`h-9 px-3 capitalize ${device === k ? 'bg-primary text-primary-foreground' : ''}`}>{k}</button>)}
        </div>
        <span className="flex-1" />
        <button type="button" aria-label="Undo" disabled={!past.length || stuck} onClick={undo} className="hidden size-9 rounded-md border border-input disabled:opacity-40 sm:block">↶</button>
        <button type="button" aria-label="Redo" disabled={!future.length || stuck} onClick={redo} className="hidden size-9 rounded-md border border-input disabled:opacity-40 sm:block">↷</button>
        <span role="status" className="text-sm text-muted-foreground">{status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Not saved'}</span>
        <a href={`/console/theme-preview/${p.revisionId}${path}`} target="_blank" rel="noopener" className="hidden min-h-9 content-center rounded-md border border-input px-3 text-sm sm:block">Preview</a>
        {p.canPublish ? <Button onClick={() => { setPubError(null); setPublishing(true) }} disabled={stuck}>Publish</Button> : <span className="text-sm text-muted-foreground">Ask the owner to publish</span>}
      </header>
      {typeof status === 'object' && <p role="alert" className="bg-danger px-4 py-2 text-sm text-danger-text">{status.error} {stuck && <button type="button" onClick={() => router.refresh()} className="underline">Reload</button>}</p>}

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside aria-label="Edit" className="h-[46dvh] shrink-0 overflow-y-auto border-t border-border bg-card p-4 md:h-auto md:w-[360px] md:border-r md:border-t-0">{panel}</aside>
        <section aria-label="Preview" className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-muted p-0 md:p-6">
          <div className="origin-top md:rounded-[28px] md:border-[8px] md:border-foreground" style={{ width: device === 'phone' ? 'min(390px, 100%)' : d.w, height: d.h, transform: device === 'desktop' ? 'scale(0.62)' : device === 'tablet' ? 'scale(0.8)' : undefined }}>
            <iframe ref={frame} title="Your shop with this look" src={`/console/theme-preview/${p.revisionId}${path}`} className="size-full bg-card" />
          </div>
        </section>
      </div>

      <Dialog open={publishing} onClose={() => setPublishing(false)} title={`Publish ${p.themeName} · ${styleName}?`}
        description={p.shopOpen ? 'Shoppers see this now. Your current look is kept in History.' : 'Your shop is closed: this is the look shoppers see when it opens.'}
        actions={<><Button variant="secondary" className="after:hidden" data-autofocus onClick={() => setPublishing(false)}>Not yet</Button><Button disabled={pending || blocking.length > 0} onClick={publish}>Publish</Button></>}>
          <div className="space-y-3 text-sm">
            {changes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{changes.map((c) => <li key={c}>{c}</li>)}</ul>}
            {blocking.length > 0 && <div role="alert" className="rounded-md bg-danger px-3 py-2 text-danger-text"><p className="font-medium">Before publishing:</p><ul className="list-disc pl-5">{blocking.map((b) => <li key={b.sectionId + b.text}>{b.text}</li>)}</ul></div>}
            {pubError && <p role="alert" className="text-danger-text">{pubError}</p>}
          </div>
      </Dialog>
    </div>
  )
}
