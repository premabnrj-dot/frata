'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from '@/components/icons/icon'
import { STUDIO_ICONS } from '@/components/icons/studio-icons'
import { Badge } from '@/components/ui/badge'
import { ICON_BUTTON, PanelRail } from '@/components/ui/panel-rail'
import type { Tabs as TabsType } from '@/components/ui/tabs'
import { useShortcutsEnabled } from '@/components/ui/use-shortcuts'
import {
  PHONE_BELOW, PHONE_TABS, columns, defaultLayout, edgeOf, inspectorTabs, layoutFor, open, previewOnly, previewOnlyOn, resize,
  phoneRegion, serializeLayout, studioKeyFor, toggle, type InspectorTab, type Region, type Layout, type PhoneTab, type Side,
} from '@/domains/studio/layout'
import { cn } from '@/lib/utils'
// The key list opens only on ? (a dialog): loaded then, not with the first paint (the page's script pin).
const KeyList = dynamic(() => import('./key-list').then((m) => m.KeyList))
// Drawn on the server as they are; their script (a drag, a tab's keys) loads after the first paint, keeping the page's
// first-load script 1.5 kB under its pin, as the release asks (Vercel measures higher than the local build).
const ResizeEdge = dynamic(() => import('@/components/ui/resize-edge').then((m) => m.ResizeEdge))
const Tabs = dynamic(() => import('@/components/ui/tabs').then((m) => m.Tabs)) as typeof TabsType
const TabPanel = dynamic(() => import('@/components/ui/tabs').then((m) => m.TabPanel))
import { PanelError } from './panel-error'

// =============================================================================
// THE STUDIO WORKBENCH'S SHELL (plan docs/plans/2026-11-22-studio-workbench.md WB·3, WB·7; mockup
// docs/mockups/2026-11-22-studio-workbench.html screen 1), shared by the live screen (/partner/studio, V3a R7) and the
// test-only fixture page (/partner/fixtures/studio): chat, preview and inspector; each side panel folds to a rail and
// resizes by its edge; the layout is kept in this browser only (a convenience, never state: try/catch, and the defaults
// draw without it). A phone shows one region at a time from a bottom bar. Keys and their rules:
// src/domains/studio/layout.ts. What fills each region is the caller's (slots); the shell holds no data.
// =============================================================================

const STORE = 'frrata.studio.layout'
const PHONE_QUERY = `(max-width: ${PHONE_BELOW - 1}px)`
const subscribe = (cb: () => void) => { const m = window.matchMedia(PHONE_QUERY); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false)
const NAMES: Record<Side, string> = { chat: 'Chat', inspector: 'Inspector' }
const TAB_WORDS: Record<InspectorTab, string> = { design: 'Design', code: 'Code', checks: 'Checks', versions: 'Versions' }
const PHONE_WORDS: Record<PhoneTab, string> = { chat: 'Chat', website: 'Website', design: 'More' }

/** What a slot may do in the shell. */
export type ShellApi = {
  phone: boolean
  previewOnly: boolean
  togglePreviewOnly: () => void
  /** Opens the inspector on a tab (on a phone, its region too). */
  show: (tab: InspectorTab, phoneToo?: boolean) => void
  /** Says a short line through the shell's one polite region. */
  say: (words: string) => void
}

export type ShellSlots = {
  top: (api: ShellApi) => React.ReactNode
  chat: { feed: (api: ShellApi) => React.ReactNode; composer: (api: ShellApi) => React.ReactNode; railNote?: string }
  preview: (api: ShellApi) => React.ReactNode
  inspector: Record<InspectorTab, (api: ShellApi) => React.ReactNode> & { toFix?: number }
  /** Said once the layout is known (the agent's progress, WB·7). */
  firstWords?: string
}

export function WorkbenchShell({ slots }: { slots: ShellSlots }) {
  const phone = usePhone()
  const [layout, setLayout] = useState<Layout>(() => defaultLayout(1280))
  const [tab, setTab] = useState<InspectorTab>('design')
  const [seen, setSeen] = useState<ReadonlySet<InspectorTab>>(new Set(['design']))
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('chat')
  const [help, setHelp] = useState(false)
  const [said, setSaid] = useState('')
  const [keysOn, setKeysOn] = useShortcutsEnabled()
  const base = useId()
  const root = useRef<HTMLDivElement>(null)
  const ready = useRef(false)
  const toFix = slots.inspector.toFix ?? 0

  // The stored layout, read once the window's width is known; kept on every change after that.
  useEffect(() => {
    let raw: string | null = null
    try { raw = localStorage.getItem(STORE) } catch { /* private window: the defaults */ }
    setLayout(layoutFor(window.innerWidth, raw))
    ready.current = true
    if (slots.firstWords) setSaid(slots.firstWords)
  }, [slots.firstWords])
  useEffect(() => { if (ready.current) try { localStorage.setItem(STORE, serializeLayout(layout)) } catch { /* this visit only */ } }, [layout])

  const say = useCallback((words: string) => setSaid((s) => (s === words ? `${words} ` : words)), [])
  const fold = useCallback((side: Side) => setLayout((l) => { const n = toggle(l, side); say(`${NAMES[side]} ${n[side].folded ? 'hidden' : 'shown'}`); return n }), [say])
  const show = useCallback((t: InspectorTab) => { setTab(t); setSeen((s) => new Set(s).add(t)); setLayout((l) => open(l, 'inspector')) }, [])
  const only = useCallback(() => setLayout((l) => { const n = previewOnly(l); say(previewOnlyOn(n) ? 'Preview only' : 'Chat and inspector shown'); return n }), [say])
  const tabs = inspectorTabs(phone)
  const shownTab = tabs.includes(tab) ? tab : 'design'
  const api: ShellApi = {
    phone, previewOnly: previewOnlyOn(layout), togglePreviewOnly: only, say,
    show: (t, phoneToo) => { show(t); if (phone && phoneToo) setPhoneTab('design') },
  }

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
      {slots.top(api)}
      <div className={cn('grid min-h-0', phone && 'grid-rows-[minmax(0,1fr)_56px]')} style={phone ? undefined : { gridTemplateColumns: columns(layout) }}>
        <aside id={`${base}-chat`} aria-label="Chat" data-region tabIndex={-1} hidden={!region('chat')}
          className={cn('relative min-h-0 min-w-0 border-r border-border outline-none', chatFolded ? 'bg-side' : 'grid grid-rows-[44px_minmax(0,1fr)_auto] bg-card', phone && 'border-0')}>
          {chatFolded
            ? <PanelRail items={[{ icon: 'messages', label: 'Show chat', note: slots.chat.railNote, expanded: false, controls: `${base}-chat`, onClick: () => fold('chat') }]} />
            : <>
                <div className="flex min-w-0 items-center gap-1.5 border-b border-line-soft pr-1.5 pl-3">
                  <h2 className="min-w-0 flex-1 truncate text-label font-semibold">Frrata agent</h2>
                  {phone ? null : <button type="button" aria-label="Hide chat" aria-expanded="true" aria-controls={`${base}-chat`} onClick={() => fold('chat')} className={ICON_BUTTON}><Icon name="sidebar" className="size-4" /></button>}
                </div>
                {slots.chat.feed(api)}
                {slots.chat.composer(api)}
                {phone ? null : edge('chat')}
              </>}
        </aside>

        <main id="content" aria-label="Preview" data-region tabIndex={-1} hidden={!region('preview')} className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-sunk outline-none">
          {slots.preview(api)}
        </main>

        <aside id={`${base}-inspector`} aria-label="Inspector" data-region tabIndex={-1} hidden={!region('inspector')}
          className={cn('relative min-h-0 min-w-0 border-l border-border outline-none', inspFolded ? 'bg-side' : 'grid grid-rows-[44px_minmax(0,1fr)] bg-card', phone && 'border-0')}>
          {inspFolded
            ? <PanelRail items={[
                { icon: STUDIO_ICONS.inspector, label: 'Show inspector', expanded: false, controls: `${base}-inspector`, onClick: () => fold('inspector') },
                { icon: STUDIO_ICONS.brush, label: 'Design', onClick: () => show('design') }, { icon: 'code', label: 'Code', onClick: () => show('code') },
                { icon: 'tick', label: 'Checks', note: toFix ? `${toFix} to fix` : undefined, onClick: () => show('checks') }, { icon: STUDIO_ICONS.clock, label: 'Versions', onClick: () => show('versions') },
              ]} />
            : <>
                <div className="flex min-w-0 items-end gap-2 border-b border-line-soft px-1">
                  <Tabs base={base} label="Inspector" variant="line" value={shownTab} onChange={show} className="min-w-0 flex-1 overflow-x-auto"
                    tabs={tabs.map((t) => ({ id: t, label: t === 'checks' && toFix ? <>Checks <Badge tone="warn">{toFix}<span className="sr-only"> to fix</span></Badge></> : TAB_WORDS[t] }))} />
                  {phone ? null : <button type="button" aria-label="Hide inspector" aria-expanded="true" aria-controls={`${base}-inspector`} onClick={() => fold('inspector')} className={cn(ICON_BUTTON, 'mb-1.5 self-center')}><Icon name={STUDIO_ICONS.inspector} className="size-4" /></button>}
                </div>
                <div className="min-h-0 overflow-auto p-3 outline-none focus-visible:ring-3 focus-visible:ring-halo" tabIndex={0} aria-label="Inspector panel">
                  <TabPanel base={base} id="design" value={shownTab}>{slots.inspector.design(api)}</TabPanel>
                  {tabs.includes('code') ? <TabPanel base={base} id="code" value={shownTab}>{seen.has('code') ? <PanelError>{slots.inspector.code(api)}</PanelError> : null}</TabPanel> : null}
                  <TabPanel base={base} id="checks" value={shownTab}>{seen.has('checks') ? <PanelError>{slots.inspector.checks(api)}</PanelError> : null}</TabPanel>
                  <TabPanel base={base} id="versions" value={shownTab}>{seen.has('versions') ? <PanelError>{slots.inspector.versions(api)}</PanelError> : null}</TabPanel>
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
      {help ? <KeyList open onClose={() => setHelp(false)} enabled={keysOn} onEnabled={setKeysOn} /> : null}
    </div>
  )
}
