'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { Choices } from '@/domains/themes/choices'
import { readinessOf, type ShopFacts } from '@/domains/themes/readiness'
import { sectionName, type SectionInstance, type SectionKey } from '@/domains/themes/sections'
import type { FooterVariant, HeaderVariant, Pairing, ThemeSettings } from '@/domains/themes/types'
import { publishLookAction, saveLookAction } from '@/app/(console)/console/look/actions'
import type { LinkTarget } from './controls'
import { SectionForm, type FormCtx } from './section-form'
import { SectionsPanel } from './sections-panel'
import type { LibraryDesign } from './section-library'
import type { ContactRow } from './pages-panel'
import type { EditorPage } from '@/lib/queries/pages'
import type { PageTemplate } from '@/domains/pages/templates'
import type { Bound } from '@/domains/policies/answers'
import { PageForm } from './page-form'
import type { StyleOption } from './theme-form'
import { Icon } from '@/components/icons/icon'
import { PublishConfirm } from './publish-confirm'
import { Segmented } from './controls'
import { menusOf, siteIsDefault, type Menus, type Palette, type SiteSettings } from '@/domains/themes/site'
import type { IconPreviews } from './site-form'
import dynamic from 'next/dynamic'

// Menus and Site settings load when opened (TS0b paid for its designs in the customizer's script this way: the page
// was already over its budget, speed review 2026-11-11 finding 4).
const MenusForm = dynamic(() => import('./menus-form').then((m) => m.MenusForm))
const SiteForm = dynamic(() => import('./site-form').then((m) => m.SiteForm))
// The Style tab's form loads when the tab opens (TS1a: the pages group paid for itself this way).
const ThemeForm = dynamic(() => import('./theme-form').then((m) => m.ThemeForm))
// TS1a: Contact, the pages and Add a page load when opened too.
const ContactPanel = dynamic(() => import('./pages-panel').then((m) => m.ContactPanel))
const PagePanel = dynamic(() => import('./pages-panel').then((m) => m.PagePanel))
const AddPage = dynamic(() => import('./pages-panel').then((m) => m.AddPage))

// =============================================================================
// The customizer (approved mockup "Customizer", "Customizer on a phone", "Publish"). One draft revision:
//   - every change is an undo step (50 kept) and an autosave 800 ms later, from the version the editor holds;
//     a stale save says who changed it (two editors) and stops autosaving until reload;
//   - the preview is the shop itself in an iframe (same origin only), refreshed after each save, the selected
//     section outlined in it;
//   - Publish lists what shoppers will see change and anything that blocks it (readiness), then offers Undo.
// =============================================================================

/** site and menus only once the merchant sets them (absent = the theme's own and the shop's default menus). */
type Layer = { settings: ThemeSettings; home: SectionInstance[]; site?: SiteSettings; menus?: Partial<Menus>; contact?: { line: string } }
/** The pages the preview can open (Look v4: page-aware editing). */
export type EditPage = 'home' | 'product' | 'collection' | 'all' | 'bag' | 'checkout'
const PAGE_NAMES: Record<EditPage, string> = { home: 'Home', product: 'Product page', collection: 'Collection page', all: 'Shop all', bag: 'Bag', checkout: 'Checkout' }
export type EditorProps = {
  revisionId: string; version: number; themeName: string; style: string; layer: Layer
  styles: StyleOption[]; allowed: { pairings: Pairing[]; headers: HeaderVariant[]; footers: FooterVariant[]; sections: SectionKey[] }
  /** The designs made for this theme (Look v3: shown first, "Made for <theme>"). */
  made: { headers?: HeaderVariant[]; footers?: FooterVariant[]; sections?: SectionKey[] }
  facts: ShopFacts; formCtx: FormCtx; targets: LinkTarget[]; fonts: Record<Pairing, string>
  /** The shop's address, for the preview's address bar. */
  address: string
  canPublish: boolean; shopOpen: boolean; nowIso: string; firstProduct: string | null; firstCollection: string | null
  /** What this theme offers for each choice (choicesFor; null = any value). */
  choices: Choices
  /** Site settings (Look v4): the resolved site (defaults filled), the theme's styles as palettes, the shop's icons drawn on the server. */
  site: SiteSettings; presets: { name: string; palette: Palette }[]; icons: IconPreviews
  /** TS1a: the shop's pages (drafts), their pictures, Contact's facts from Settings and the FAQ's bound answers. */
  pages: EditorPage[]; pageThumbs: Record<PageTemplate, React.ReactNode>; contactRows: ContactRow[]; answers: Record<Bound, string | null>
  /** TS0b: the theme's designs for the library, each with its picture drawn on the server. */
  designs?: LibraryDesign[]
}


/** The widths the preview draws the shop at; it is scaled to fit the stage (Look v3: a computer first). */
const DEVICES = { desktop: { w: 1280, label: 'Computer' }, phone: { w: 390, label: 'Phone' } } as const
type Device = keyof typeof DEVICES
/** How long the preview says "Going live" at least, so publishing is felt, not a flicker (Look v3). */
const GOING_LIVE_MS = 1300
type Status = 'saved' | 'saving' | { error: string }

export function Editor(p: EditorProps) {
  const router = useRouter()
  const now = useMemo(() => new Date(p.nowIso), [p.nowIso])
  const [layer, setLayer] = useState<Layer>(p.layer)
  const [style, setStyle] = useState(p.style)
  const [past, setPast] = useState<{ layer: Layer; style: string }[]>([])
  const [future, setFuture] = useState<{ layer: Layer; style: string }[]>([])
  const [tab, setTab] = useState<'sections' | 'menus' | 'theme'>('sections')
  // The gear (Look v4): Site settings take the panel; the panel folds to a rail of icons.
  const [siteOpen, setSiteOpen] = useState(false)
  const [folded, setFolded] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const [ask, setAsk] = useState(false)
  const [going, setGoing] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  // TS1a: 'contact' and `page:<id>` too (the Pages group of the page picker).
  const [page, setPage] = useState<EditPage | 'contact' | `page:${string}`>('home')
  const [pages, setPages] = useState(p.pages)
  const [adding, setAdding] = useState(false)
  const shown = page.startsWith('page:') ? pages.find((x) => `page:${x.id}` === page) ?? null : null
  const pageName = page === 'contact' ? 'Contact' : shown ? shown.draft.title : PAGE_NAMES[page as EditPage]
  const [status, setStatus] = useState<Status>('saved')
  const [pubError, setPubError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const version = useRef(p.version)
  const frame = useRef<HTMLIFrameElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ layer, style })
  latest.current = { layer, style }
  const latestSel = useRef<string | null>(null)
  latestSel.current = selected
  const stuck = typeof status === 'object' && /changed this draft|published|gone/.test(status.error)

  // While a change saves, the preview dims; it comes back as the shop redraws with it (motion system: a theme or
  // setting change fades old into new in 200 ms, never a jump).
  const post = (m: object) => frame.current?.contentWindow?.postMessage(m, window.location.origin)
  // Whether a save is waiting on its 800 ms (state, so "leave before it saves?" reads it truly; the ref holds the timer).
  const [due, setDue] = useState(false)
  const save = useCallback(async () => {
    timer.current = null; setDue(false)
    setStatus('saving')
    const { layer: l, style: s } = latest.current
    const r = await saveLookAction({ revisionId: p.revisionId, version: version.current, style: s, layer: l })
    if (!r.ok) { setStatus({ error: r.error }); return }
    version.current = r.version; setStatus('saved'); post({ type: 'refresh' })
  }, [p.revisionId])
  const schedule = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(save, 800); setDue(true) }

  const change = (next: Layer, nextStyle = style) => {
    if (stuck) return
    setPast((h) => [...h.slice(-49), { layer, style }]); setFuture([])
    setLayer(next); setStyle(nextStyle); schedule()
    // A removal's Undo is for that removal only: the next change ends it (impact review 2026-11-09).
    setToast(null)
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
  // A section clicked in the preview (the bridge, same origin and our own frame only) opens its settings here.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return
      const m = e.data as { type?: string; sectionId?: unknown }
      if (m.type === 'picked' && typeof m.sectionId === 'string' && /^[a-z0-9-]{1,40}$/.test(m.sectionId)) { setTab('sections'); setPage('home'); setSelected(m.sectionId) }
      if (m.type === 'ready') post({ type: 'select', sectionId: latestSel.current })
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  // The preview's stage: the shop is drawn at the device's real width and scaled down to fit it.
  useEffect(() => {
    const el = stage.current; if (!el) return
    const ro = new ResizeObserver(([e]) => { if (e) setBox({ w: e.contentRect.width, h: e.contentRect.height }) })
    ro.observe(el); return () => ro.disconnect()
  }, [])
  // Leaving while a change is still on its way asks first (Look v3 § Confirmations).
  const unsaved = status !== 'saved' || due
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])
  const [leaving, setLeaving] = useState(false)
  // A removal says so with Undo for 8 s (Look v3: a toast, not a dialog: it is undone in one tap).
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = (t: string) => { setToast(t); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 8000) }

  const issues = useMemo(() => readinessOf(layer.home, p.facts, now, p.formCtx.designs), [layer.home, p.facts, now, p.formCtx.designs])
  const blocking = issues.filter((i) => i.blocks)
  // One line a section: its first blocking issue, else its first (a soft line never hides what blocks Publish).
  const issueMap = new Map<string, string>()
  for (const i of [...blocking, ...issues]) if (!issueMap.has(i.sectionId)) issueMap.set(i.sectionId, i.text)
  const styleName = p.styles.find((s) => s.key === style)?.name ?? style
  const sel = layer.home.find((s) => s.id === selected) ?? null
  const path = page === 'contact' ? '/policies/contact' : shown ? `/pages/${shown.draft.handle}` : page === 'product' && p.firstProduct ? `/products/${p.firstProduct}` : page === 'collection' && p.firstCollection ? `/collections/${p.firstCollection}` : page === 'all' ? '/products' : page === 'bag' ? '/bag' : page === 'checkout' ? '/checkout' : ''
  const site = layer.site ?? p.site
  const menus = menusOf(layer.menus, p.formCtx.collections)
  const d = DEVICES[device]
  // The shop drawn at the device width, scaled to the stage (never above 100%); the phone keeps its own width.
  const scale = box.w ? Math.min(1, (box.w - (device === 'phone' ? 32 : 24)) / d.w) : device === 'phone' ? 1 : 0.6
  const frameH = box.h ? Math.max(480, (box.h - 56) / scale) : 800

  // Publish (Look v3): a small confirm, then the preview says "Going live" while it publishes (held at least
  // GOING_LIVE_MS inside the same transition, so the page can't change under it), then this page re-renders with no
  // draft and shows the success popup over the live shop (published.tsx).
  const publish = () => {
    // Shown at once: state set inside the transition would wait for it to end.
    setPubError(null); setAsk(false); setGoing(true)
    go()
  }
  const go = () => start(async () => {
    try {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; await save() }
      const [r] = await Promise.all([publishLookAction({ revisionId: p.revisionId, version: version.current, pages: Object.fromEntries(pages.map((x) => [x.id, x.version])) }), new Promise((ok) => setTimeout(ok, GOING_LIVE_MS))])
      if (!r.ok) { setGoing(false); setPubError(r.error); setAsk(true) }
    } catch { setGoing(false); setPubError('We couldn’t publish. Your draft is safe; try again.'); setAsk(true) }
  })

  const setSettings = (s: Partial<ThemeSettings>) => change({ ...layer, settings: { ...layer.settings, ...s } })
  const icons = p.icons[site.icons.library]
  const panel = siteOpen ? (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><button type="button" onClick={() => setSiteOpen(false)} className="text-sm text-muted-foreground">‹ {p.themeName}</button></div>
      <h2 className="text-lg font-semibold">Site settings</h2>
      <SiteForm site={site} presets={p.presets} icons={p.icons} theme={p.styles.find((s) => s.key === style)?.light ?? []}
        // Back to the defaults = not set (impact review 2026-11-09: trying another theme then loses nothing).
        set={(x) => { const { site: _, ...rest } = layer; change(siteIsDefault(x) ? rest : { ...rest, site: x }) }} />
    </div>
  ) : (
    <div className="space-y-4">
      <div role="tablist" aria-label="Edit" className="grid grid-flow-col auto-cols-fr rounded-lg bg-muted p-0.5 text-sm">
        {(['sections', 'menus', 'theme'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-9 rounded-md font-medium transition-[background-color,color] duration-fast ${tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t === 'theme' ? 'Style' : t === 'menus' ? 'Menus' : page === 'home' ? 'Sections' : pageName}</button>)}
      </div>
      {tab === 'sections' && page !== 'home' && page !== 'contact' && !shown && <PageForm page={page as Exclude<EditPage, 'home'>} settings={layer.settings} choices={p.choices} set={setSettings} openSite={() => setSiteOpen(true)} />}
      {tab === 'sections' && page === 'contact' && <ContactPanel line={layer.contact?.line ?? ''} rows={p.contactRows} address={p.address}
        setLine={(line) => { const { contact: _old, ...rest } = layer; change(line.trim() ? { ...rest, contact: { line } } : rest) }} />}
      {tab === 'sections' && shown && <PagePanel key={shown.id} page={shown} c={p.formCtx} answers={p.answers} address={p.address}
        onSaved={(x) => { setPages((ps) => ps.map((y) => (y.id === x.id ? x : y))); post({ type: 'refresh' }) }}
        onRemoved={(id, v) => { setPages((ps) => (v === null ? ps.filter((y) => y.id !== id) : ps.map((y) => (y.id === id ? { ...y, version: v, draft: { ...y.draft, removed: true } } : y)))); setPage('home'); say('Page removed') }} />}
      {tab === 'menus' && <MenusForm menus={menus} own={layer.menus ?? {}} rowLimit={layer.settings.header === 'split' ? 5 : null} targets={p.targets} icons={icons} set={(m) => change({ ...layer, menus: m })} />}
      {tab === 'sections' && page === 'home' && (sel ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setSelected(null)} className="text-sm text-muted-foreground">‹ Sections</button>
          <SectionForm s={sel} c={p.formCtx} set={(s) => change({ ...layer, home: layer.home.map((x) => (x.id === s.id ? s : x)) })} />
          {issueMap.has(sel.id) && <p role="status" className="rounded-md bg-warn px-3 py-2 text-sm text-warn-text">{issueMap.get(sel.id)}</p>}
          <button type="button" onClick={() => { change({ ...layer, home: layer.home.filter((x) => x.id !== sel.id) }); setSelected(null); say(`${sectionName(sel, p.formCtx.designs)} removed`) }} className="min-h-9 text-sm text-danger-text underline underline-offset-4">Remove this section</button>
        </div>
      ) : (
        <SectionsPanel home={layer.home} selected={selected} allowed={p.allowed.sections} made={p.made.sections ?? []} themeName={p.themeName} issues={issueMap} now={now} designs={p.designs}
          onSelect={setSelected} onChange={(home, id) => { change({ ...layer, home }); if (id) setSelected(id) }} />
      ))}
      {tab === 'theme' && <ThemeForm settings={layer.settings} style={style} styles={p.styles} allowed={p.allowed} made={p.made} themeName={p.themeName} choices={p.choices} schemes={p.formCtx.schemes.flatMap((x) => (x.key === 'signal' ? [] : [{ key: x.key, name: x.name }]))} targets={p.targets} fonts={p.fonts}
        set={setSettings} setStyle={(k) => change(layer, k)} paletteOn={!!site.palette} openSite={() => setSiteOpen(true)} onPage={(pg) => { if (pg === 'collection' ? p.firstCollection : true) setPage(pg) }} />}
    </div>
  )

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground" style={{ '--icon-stroke': { thin: '1', regular: '1.5', bold: '2' }[site.icons.stroke] } as React.CSSProperties}>
      <header className="relative flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2">
        <Link href="/console/look" onClick={(e) => { if (unsaved) { e.preventDefault(); setLeaving(true) } }} className="min-h-10 content-center text-sm">‹ Look</Link>
        <span className="font-semibold">{p.themeName} · {styleName}</span><Badge tone="warn">Draft</Badge>
        <span className="flex-1" />
        <button type="button" aria-label="Undo" disabled={!past.length || stuck} onClick={undo} className="hidden size-9 place-items-center rounded-md border border-input transition-[scale] duration-fast active:scale-95 disabled:opacity-40 sm:grid"><Icon name="undo" className="size-4" /></button>
        <button type="button" aria-label="Redo" disabled={!future.length || stuck} onClick={redo} className="hidden size-9 place-items-center rounded-md border border-input transition-[scale] duration-fast active:scale-95 disabled:opacity-40 sm:grid"><Icon name="redo" className="size-4" /></button>
        <span role="status" className="flex items-center gap-1.5 text-sm text-muted-foreground"><span aria-hidden="true" className={`size-2 rounded-full ${status === 'saved' ? 'bg-ok-text' : status === 'saving' ? 'animate-pulse bg-warn-text' : 'bg-danger-text'}`} />{status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving…' : 'Not saved'}</span>
        <a href={`/console/theme-preview/${p.revisionId}${path}`} target="_blank" rel="noopener" className="hidden min-h-9 content-center rounded-md border border-input px-3 text-sm sm:block">Full preview</a>
        {p.canPublish ? (
          <span className="relative">
            <Button data-publish onClick={() => { setPubError(null); setAsk((a) => !a) }} disabled={stuck || going} aria-expanded={ask}>{going ? 'Publishing…' : 'Publish'}</Button>
            {ask && <PublishConfirm themeName={p.themeName} shopOpen={p.shopOpen} blocking={blocking.map((b) => b.text)} error={pubError} pending={pending}
              onCancel={() => setAsk(false)} onPublish={publish} onFix={(text) => { const i = issues.find((x) => x.text === text); setAsk(false); setTab('sections'); setPage('home'); if (i) setSelected(i.sectionId) }} />}
          </span>
        ) : <span className="text-sm text-muted-foreground">Ask the owner to publish</span>}
        {going && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-going-live bg-brand" />}
      </header>
      {typeof status === 'object' && <p role="alert" className="bg-danger px-4 py-2 text-sm text-danger-text">{status.error} {stuck && <button type="button" onClick={() => router.refresh()} className="underline">Reload</button>}</p>}

      <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        {folded ? (
          // Folded (Look v4): a rail of icons on a computer; each opens the panel where it points.
          <nav aria-label="Edit" className="hidden shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-3 md:flex md:w-14">
            {([['site', 'gear', 'Site settings'], ['sections', 'rows', 'Sections'], ['menus', 'menu', 'Menus'], ['theme', 'brand', 'Style']] as const).map(([k, ic, label]) => (
              <button key={k} type="button" aria-label={label} title={label} onClick={() => { setFolded(false); if (k === 'site') setSiteOpen(true); else { setSiteOpen(false); setTab(k) } }}
                className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><Icon name={ic} className="size-5" /></button>
            ))}
          </nav>
        ) : null}
        <aside aria-label="Edit" className={`h-[46dvh] shrink-0 overflow-y-auto border-t border-border bg-card p-4 md:h-auto md:w-[380px] md:border-r md:border-t-0 ${folded ? 'md:hidden' : ''}`}>
          <div className="mb-3 flex items-center gap-2">
            <button type="button" aria-label="Site settings" aria-pressed={siteOpen} onClick={() => setSiteOpen((o) => !o)} className={`flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-sm font-medium ${siteOpen ? 'border-foreground' : 'border-input'}`}><Icon name="gear" className="size-4" />Site</button>
            <span className="flex-1" />
            <button type="button" aria-label="Fold the panel" onClick={() => setFolded(true)} className="hidden size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted md:grid"><Icon name="back" className="size-4" /></button>
          </div>
          {panel}
        </aside>
        <section aria-label="Preview" className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
            <Segmented label="Preview size" value={device} onChange={setDevice} options={(Object.keys(DEVICES) as Device[]).map((k) => ({ value: k, label: DEVICES[k].label }))} />
            <label className="sr-only" htmlFor="page-pick">Page</label>
            <select id="page-pick" value={page} onChange={(e) => { if (e.target.value === '+page') { setAdding(true); return } setPage(e.target.value as typeof page); setSelected(null); if (e.target.value === 'contact' || e.target.value.startsWith('page:')) setTab('sections') }} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
              <optgroup label="Shop"><option value="home">Home</option>{p.firstProduct && <option value="product">A product</option>}{p.firstCollection && <option value="collection">A collection</option>}
              <option value="all">Shop all</option><option value="bag">Bag</option><option value="checkout">Checkout</option></optgroup>
              <optgroup label="Pages"><option value="contact">Contact</option>{pages.filter((x) => !x.draft.removed).map((x) => <option key={x.id} value={`page:${x.id}`}>{x.draft.title}{x.draft.hidden ? ' (hidden)' : ''}</option>)}
              <option value="+page">Add a page…</option></optgroup>
            </select>
            <span className="text-sm text-muted-foreground">Editing: <b className="font-medium text-foreground">{pageName}</b></span>
            {adding && <AddPage open={adding} onClose={() => setAdding(false)} hasFaq={pages.some((x) => x.template === 'faq' && !x.draft.removed)} count={pages.length} thumbs={p.pageThumbs}
              onAdded={(x) => { setPages((ps) => [...ps, x]); setAdding(false); setPage(`page:${x.id}`); setTab('sections') }} />}
            <span className="ml-auto hidden font-mono text-xs text-muted-foreground sm:inline">{d.w} px · {Math.round(scale * 100)}%</span>
          </div>
          <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden p-3 md:p-4">
            <div className="mx-auto overflow-hidden rounded-xl border border-border bg-card shadow-xl transition-[width] duration-slow ease-standard" style={{ width: d.w * scale }}>
              <div className="flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5" aria-hidden="true">
                <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-border" /><i className="size-2.5 rounded-full bg-border" /><i className="size-2.5 rounded-full bg-border" /></span>
                <span className="min-w-0 flex-1 truncate rounded-md bg-card px-2 py-0.5 font-mono text-xs text-muted-foreground">{p.address}{path}</span>
              </div>
              <div className="relative overflow-hidden" style={{ height: frameH * scale }}>
                <iframe ref={frame} title="Your shop with this look" src={`/console/theme-preview/${p.revisionId}${path}`}
                  className={`origin-top-left bg-card transition-opacity duration-base ease-standard ${status === 'saving' ? 'opacity-70' : ''}`} style={{ width: d.w, height: frameH, transform: `scale(${scale})` }} />
                {going && <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid justify-items-center"><span className="absolute inset-0 animate-going-sweep bg-linear-to-r from-transparent via-brand/15 to-transparent bg-[length:300%_100%]" />
                  <span className="relative mt-6 flex items-center gap-2 self-start rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg"><span className="size-4 animate-spin rounded-full border-2 border-background/30 border-t-brand" />Going live</span></div>}
              </div>
            </div>
          </div>
        </section>
      </div>

      {toast && <div data-toast role="status" className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">
        <span>{toast}</span><button type="button" onClick={() => { undo(); setToast(null) }} className="font-semibold underline underline-offset-4">Undo</button></div>}
      <Dialog open={leaving} onClose={() => setLeaving(false)} title="Leave before it saves?" description="Your last change hasn’t reached the draft."
        actions={<><Button variant="secondary" className="after:hidden" data-autofocus onClick={() => setLeaving(false)}>Stay</Button><Button variant="destructive" onClick={() => { setLeaving(false); router.push('/console/look') }}>Leave</Button></>} />
    </div>
  )
}
