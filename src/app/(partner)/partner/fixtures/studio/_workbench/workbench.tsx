'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from '@/components/icons/icon'
import { STUDIO_ICONS } from '@/components/icons/studio-icons'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/empty'
import { ICON_BUTTON, PanelRail } from '@/components/ui/panel-rail'
import { ResizeEdge } from '@/components/ui/resize-edge'
import { TabPanel, Tabs } from '@/components/ui/tabs'
import { useShortcutsEnabled } from '@/components/ui/use-shortcuts'
import {
  PHONE_BELOW, PHONE_TABS, columns, defaultLayout, edgeOf, inspectorTabs, layoutFor, open, previewOnly, previewOnlyOn, resize,
  phoneRegion, serializeLayout, studioKeyFor, toggle, type InspectorTab, type Region, type Layout, type PhoneTab, type Side,
} from '@/domains/studio/layout'
import { cn } from '@/lib/utils'
import { ChatFeed, Composer } from './chat'
import { DesignTab } from './design-tab'
import { BUILDING, TO_FIX, type Part } from './fixtures'
import { KeyList } from './key-list'
import { PanelError } from './panel-error'
import { Preview } from './preview'
import { TopBar } from './top-bar'

// =============================================================================
// THE STUDIO WORKBENCH, SHELL ONLY (plan WB·3, WB·7; mockup docs/mockups/2026-11-22-studio-workbench.html screen 1).
// Chat, preview and inspector; each side panel folds to a rail and resizes by its edge; the layout is kept in this
// browser only (a convenience, never state: try/catch, and the defaults draw without it). A phone shows one region at
// a time from a bottom bar. Keys and their rules: src/domains/studio/layout.ts. Fixture data: ./fixtures.ts.
// =============================================================================

const CodeTab = dynamic(() => import('./code-tab'), { loading: () => <Skeleton /> })
const ChecksTab = dynamic(() => import('./checks-tab'), { loading: () => <Skeleton /> })
const VersionsTab = dynamic(() => import('./versions-tab'), { loading: () => <Skeleton /> })

const STORE = 'frrata.studio.layout'
const PHONE_QUERY = `(max-width: ${PHONE_BELOW - 1}px)`
const subscribe = (cb: () => void) => { const m = window.matchMedia(PHONE_QUERY); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false)
const NAMES: Record<Side, string> = { chat: 'Chat', inspector: 'Inspector' }
const TAB_WORDS: Record<InspectorTab, string> = { design: 'Design', code: 'Code', checks: 'Checks', versions: 'Versions' }
const PHONE_WORDS: Record<PhoneTab, string> = { chat: 'Chat', website: 'Website', design: 'More' }

export function Workbench() {
  const phone = usePhone()
  const [layout, setLayout] = useState<Layout>(() => defaultLayout(1280))
  const [tab, setTab] = useState<InspectorTab>('design')
  const [seen, setSeen] = useState<ReadonlySet<InspectorTab>>(new Set(['design']))
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('chat')
  const [picked, setPicked] = useState<Part>('hero')
  const [help, setHelp] = useState(false)
  const [said, setSaid] = useState('')
  const [keysOn, setKeysOn] = useShortcutsEnabled()
  const base = useId()
  const root = useRef<HTMLDivElement>(null)
  const ready = useRef(false)

  // The stored layout, read once the window's width is known; kept on every change after that.
  useEffect(() => {
    let raw: string | null = null
    try { raw = localStorage.getItem(STORE) } catch { /* private window: the defaults */ }
    setLayout(layoutFor(window.innerWidth, raw))
    ready.current = true
    setSaid(`Building ${BUILDING} · about 1–2 min`) // the agent's progress, once a step (WB·7)
  }, [])
  useEffect(() => { if (ready.current) try { localStorage.setItem(STORE, serializeLayout(layout)) } catch { /* this visit only */ } }, [layout])

  const say = useCallback((words: string) => setSaid((s) => (s === words ? `${words} ` : words)), [])
  const fold = useCallback((side: Side) => setLayout((l) => { const n = toggle(l, side); say(`${NAMES[side]} ${n[side].folded ? 'hidden' : 'shown'}`); return n }), [say])
  const show = useCallback((t: InspectorTab) => { setTab(t); setSeen((s) => new Set(s).add(t)); setLayout((l) => open(l, 'inspector')) }, [])
  const only = useCallback(() => setLayout((l) => { const n = previewOnly(l); say(previewOnlyOn(n) ? 'Preview only' : 'Chat and inspector shown'); return n }), [say])
  const pick = (p: Part) => { setPicked(p); show('design'); if (phone) setPhoneTab('design') }
  const tabs = inspectorTabs(phone)
  const shownTab = tabs.includes(tab) ? tab : 'design'

  // The keys (spec § 1): one handler, every rule in studioKeyFor. F6 moves among the regions on screen.
  const live = useRef({ fold, show, only, phone, keysOn })
  live.current = { fold, show, only, phone, keysOn }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : document.body
      const k = studioKeyFor({
        key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, phone: live.current.phone,
        target: { tag: t.tagName, editable: t.isContentEditable, type: t instanceof HTMLInputElement ? t.type : null },
        modalOpen: !!document.querySelector('dialog[open]'), enabled: live.current.keysOn,
      })
      if (!k) return
      e.preventDefault()
      if (k.do === 'toggle') live.current.fold(k.side)
      else if (k.do === 'previewOnly') live.current.only()
      else if (k.do === 'tab') live.current.show(k.tab)
      else if (k.do === 'help') setHelp(true)
      else {
        const regions = [...(root.current?.querySelectorAll<HTMLElement>('[data-region]') ?? [])].filter((r) => r.offsetParent !== null)
        const at = regions.findIndex((r) => r.contains(document.activeElement))
        const n = regions.length
        regions[at < 0 ? (k.back ? n - 1 : 0) : (at + (k.back ? n - 1 : 1)) % n]?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const edge = (side: Side) => {
    const e = edgeOf(side, layout[side].width)
    return <ResizeEdge label={`Resize ${NAMES[side].toLowerCase()}`} controls={`${base}-${side}`} {...e}
      onChange={(w) => setLayout((l) => resize(l, side, w))} />
  }
  const region = (r: Region) => !phone || phoneRegion(phoneTab) === r
  const chatFolded = !phone && layout.chat.folded
  const inspFolded = !phone && layout.inspector.folded

  return (
    <div ref={root} data-neel="" data-shell="" className="grid h-dvh grid-rows-[52px_minmax(0,1fr)] overflow-hidden bg-background text-sm text-foreground">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:p-2">Skip to content</a>
      <TopBar phone={phone} />
      <div className={cn('grid min-h-0', phone && 'grid-rows-[minmax(0,1fr)_56px]')} style={phone ? undefined : { gridTemplateColumns: columns(layout) }}>
        <aside id={`${base}-chat`} aria-label="Chat" data-region tabIndex={-1} hidden={!region('chat')}
          className={cn('relative min-h-0 min-w-0 border-r border-border outline-none', chatFolded ? 'bg-side' : 'grid grid-rows-[44px_minmax(0,1fr)_auto] bg-card', phone && 'border-0')}>
          {chatFolded
            ? <PanelRail items={[{ icon: 'messages', label: 'Show chat', note: '1 new', expanded: false, controls: `${base}-chat`, onClick: () => fold('chat') }]} />
            : <>
                <div className="flex min-w-0 items-center gap-1.5 border-b border-line-soft pr-1.5 pl-3">
                  <h2 className="min-w-0 flex-1 truncate text-label font-semibold">Frrata agent</h2>
                  {phone ? null : <button type="button" aria-label="Hide chat" aria-expanded="true" aria-controls={`${base}-chat`} onClick={() => fold('chat')} className={ICON_BUTTON}><Icon name="sidebar" className="size-4" /></button>}
                </div>
                <ChatFeed />
                <Composer working />
                {phone ? null : edge('chat')}
              </>}
        </aside>

        <main id="content" aria-label="Preview" data-region tabIndex={-1} hidden={!region('preview')} className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-sunk outline-none">
          <Preview phone={phone} previewOnly={previewOnlyOn(layout)} onPreviewOnly={only} picked={picked} onPick={pick} />
        </main>

        <aside id={`${base}-inspector`} aria-label="Inspector" data-region tabIndex={-1} hidden={!region('inspector')}
          className={cn('relative min-h-0 min-w-0 border-l border-border outline-none', inspFolded ? 'bg-side' : 'grid grid-rows-[44px_minmax(0,1fr)] bg-card', phone && 'border-0')}>
          {inspFolded
            ? <PanelRail items={[
                { icon: STUDIO_ICONS.inspector, label: 'Show inspector', expanded: false, controls: `${base}-inspector`, onClick: () => fold('inspector') },
                { icon: STUDIO_ICONS.brush, label: 'Design', onClick: () => show('design') }, { icon: 'code', label: 'Code', onClick: () => show('code') },
                { icon: 'tick', label: 'Checks', note: TO_FIX ? `${TO_FIX} to fix` : undefined, onClick: () => show('checks') }, { icon: STUDIO_ICONS.clock, label: 'Versions', onClick: () => show('versions') },
              ]} />
            : <>
                <div className="flex min-w-0 items-end gap-2 border-b border-line-soft px-1">
                  <Tabs base={base} label="Inspector" variant="line" value={shownTab} onChange={show} className="min-w-0 flex-1 overflow-x-auto"
                    tabs={tabs.map((t) => ({ id: t, label: t === 'checks' && TO_FIX ? <>Checks <Badge tone="warn">{TO_FIX}<span className="sr-only"> to fix</span></Badge></> : TAB_WORDS[t] }))} />
                  {phone ? null : <button type="button" aria-label="Hide inspector" aria-expanded="true" aria-controls={`${base}-inspector`} onClick={() => fold('inspector')} className={cn(ICON_BUTTON, 'mb-1.5 self-center')}><Icon name={STUDIO_ICONS.inspector} className="size-4" /></button>}
                </div>
                <div className="min-h-0 overflow-auto p-3">
                  <TabPanel base={base} id="design" value={shownTab}><DesignTab key={picked} picked={picked} /></TabPanel>
                  {tabs.includes('code') ? <TabPanel base={base} id="code" value={shownTab}>{seen.has('code') ? <PanelError><CodeTab say={say} /></PanelError> : null}</TabPanel> : null}
                  <TabPanel base={base} id="checks" value={shownTab}>{seen.has('checks') ? <PanelError><ChecksTab /></PanelError> : null}</TabPanel>
                  <TabPanel base={base} id="versions" value={shownTab}>{seen.has('versions') ? <PanelError><VersionsTab /></PanelError> : null}</TabPanel>
                </div>
                {phone ? null : edge('inspector')}
              </>}
        </aside>

        {phone
          ? <nav aria-label="Studio sections" data-region tabIndex={-1} className="grid grid-cols-3 border-t border-border bg-side outline-none">
              {PHONE_TABS.map((t) => (
                <button key={t} type="button" aria-pressed={phoneTab === t} onClick={() => setPhoneTab(t)}
                  className={cn('grid justify-items-center gap-0.5 py-1.5 text-small', phoneTab === t ? 'font-medium text-primary' : 'text-muted-foreground')}>
                  <Icon name={t === 'chat' ? 'messages' : t === 'website' ? STUDIO_ICONS.device : 'menu'} className="size-5.5" />{PHONE_WORDS[t]}
                </button>
              ))}
            </nav>
          : null}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{said}</p>
      <KeyList open={help} onClose={() => setHelp(false)} enabled={keysOn} onEnabled={setKeysOn} />
    </div>
  )
}
