'use client'

import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/tabs.tsx — TABS OVER ONE AREA (Neel N2; WAI-ARIA tabs pattern).
// A tablist of buttons, each controlling its panel; ← → Home End move between tabs and select (automatic activation: the
// panels are cheap, already mounted). One tab is in the tab order (roving tabindex). Panels stay mounted (hidden), so what
// was typed survives a switch, and a field with a mistake can be shown by selecting its tab. For pages, use ViewTabs
// (links); these switch a part of one page. `line`: underline tabs over a panel's body (the Studio inspector, WB·3;
// mockup 2026-11-22 screen 1 `.tabs`), the chosen one in text with a 2 px neel line.
// =============================================================================

export type Tab<T extends string> = { id: T; label: ReactNode }

/** `base`: one `useId()` from the caller, shared with its TabPanels so each tab names its panel and back. */
export function Tabs<T extends string>({ base, label, tabs, value, onChange, className, variant = 'segment' }: {
  base: string; label: string; tabs: readonly Tab<T>[]; value: T; onChange: (v: T) => void; className?: string; variant?: 'segment' | 'line'
}) {
  const line = variant === 'line'
  const list = useRef<HTMLDivElement>(null)
  const go = (i: number) => {
    const t = tabs[(i + tabs.length) % tabs.length]!
    onChange(t.id)
    requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(base, t.id))}`)?.focus())
  }
  const at = tabs.findIndex((t) => t.id === value)
  return (
    <div ref={list} role="tablist" aria-label={label} className={cn(line ? 'flex items-end gap-0.5' : 'inline-flex gap-0.5 rounded-mid border border-line-soft bg-sunk p-[3px]', className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1) }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1) }
        else if (e.key === 'Home') { e.preventDefault(); go(0) }
        else if (e.key === 'End') { e.preventDefault(); go(tabs.length - 1) }
      }}>
      {tabs.map((t) => (
        <button key={t.id} id={tabId(base, t.id)} type="button" role="tab" aria-selected={t.id === value} aria-controls={panelId(base, t.id)}
          tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}
          className={line
            ? cn('inline-flex min-h-11 items-center gap-1.5 border-b-2 px-2 pt-2.5 pb-2 text-label whitespace-nowrap transition-colors duration-fast ease-standard',
              t.id === value ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')
            : cn('min-h-11 rounded-[calc(var(--r-mid)-3px)] px-3 text-label font-medium transition-colors duration-fast ease-standard md:min-h-[30px]',
              t.id === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{t.label}</button>
      ))}
    </div>
  )
}

const tabId = (base: string, id: string) => `${base}-tab-${id}`
const panelId = (base: string, id: string) => `${base}-panel-${id}`

/** A tab's panel: `const base = useId(); <Tabs base={base} …/> <TabPanel base={base} id="price" value={tab}>…`. */
export function TabPanel({ base, id, value, children, className }: { base: string; id: string; value: string; children: ReactNode; className?: string }) {
  return <div id={panelId(base, id)} role="tabpanel" aria-labelledby={tabId(base, id)} hidden={id !== value} tabIndex={0} className={className}>{children}</div>
}
